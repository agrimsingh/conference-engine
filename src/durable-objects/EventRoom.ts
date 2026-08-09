import { DurableObject } from "cloudflare:workers";
import { detectConflicts, formatScheduleConflicts, isSubmissionStatus, normalizeSpeakerKey, transitionSubmission, type ScheduleInterval } from "@/lib/domain";
import { stableAgendaUid } from "@/lib/email/ics";
import { deleteRoom, updateEventConfiguration, updateRoom } from "@/lib/events/configuration";
import { isScheduleAction, type ScheduleAction } from "@/lib/schedule/actions";
import { validateEventScheduleBounds } from "@/lib/schedule/date-bounds";

type ScheduleInput = { eventId: string; submissionId: string; startsAtMs: number; endsAtMs: number; roomName: string; trackId?: string | null };
type BulkPublicationInput = { eventId: string; submissionIds: string[]; action: "publish" | "unpublish" };
type ConfigurationMutation =
	| { action: "event-settings"; input: Record<string, unknown> }
	| { action: "room-update"; id: unknown; name: unknown }
	| { action: "room-delete"; id: unknown };

export class EventRoom extends DurableObject<CloudflareEnv> {
	private queue: Promise<void> = Promise.resolve();

	private async serialized<T>(operation: () => Promise<T>): Promise<T> {
		const previous = this.queue;
		let release: () => void = () => undefined;
		this.queue = new Promise<void>((resolve) => { release = resolve; });
		await previous;
		try { return await operation(); } finally { release(); }
	}

	async fetch(request: Request): Promise<Response> {
		const url = new URL(request.url);
		if (request.method === "POST" && url.pathname === "/configuration") {
			const eventId = request.headers.get("x-ce-event-id") ?? "";
			const mutation = await parseConfigurationMutation(request);
			if (!eventId || !mutation) return Response.json({ ok: false, error: "Invalid configuration request" }, { status: 400 });
			const result = await this.serialized(() => this.configure(eventId, mutation));
			return Response.json(result, { status: result.ok ? 200 : result.status });
		}
		if (request.method === "POST" && url.pathname === "/broadcast") {
			const body = await request.text();
			this.broadcast(body || JSON.stringify({ type: "invalidate" }));
			return new Response("ok");
		}
		if (request.method === "POST" && url.pathname === "/schedule") {
			const input = await parseScheduleRequest(request);
			if (!input) return Response.json({ ok: false, error: "Invalid schedule request" }, { status: 400 });
			const result = await this.serialized(() => this.schedule(input));
			return Response.json(result, { status: result.ok ? 200 : result.status });
		}
		if (request.method === "POST" && url.pathname === "/bulk-publication") {
			const input = await parseBulkPublicationRequest(request);
			if (!input) return Response.json({ ok: false, error: "Invalid bulk publication request" }, { status: 400 });
			const result = await this.serialized(() => this.bulkPublication(input));
			return Response.json(result, { status: result.ok ? 200 : result.status });
		}
		if ((request.method === "DELETE" || request.method === "PATCH") && url.pathname === "/schedule") {
			const eventId = request.headers.get("x-ce-event-id") ?? "";
			let value: unknown;
			try { value = await request.json(); } catch { return Response.json({ ok: false, error: "Invalid schedule request" }, { status: 400 }); }
			const body = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
			const submissionId = typeof body.submissionId === "string" ? body.submissionId : "";
			const action = request.method === "DELETE" ? "unplace" : body.action;
			if (!eventId || !submissionId || !isScheduleAction(action)) return Response.json({ ok: false, error: "Invalid schedule action" }, { status: 400 });
			const result = await this.serialized(() => this.scheduleAction(eventId, submissionId, action));
			return Response.json(result, { status: result.ok ? 200 : result.status });
		}

		if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
			return new Response("Expected WebSocket upgrade", { status: 426 });
		}
		const nonce = request.headers.get("x-ce-room-ticket-nonce");
		const expiresAt = Number(request.headers.get("x-ce-room-ticket-exp"));
		if (!nonce || !Number.isFinite(expiresAt) || expiresAt < Date.now() || expiresAt > Date.now() + 60_000 || !(await this.consumeTicket(nonce, expiresAt))) {
			return new Response("Unauthorized", { status: 401 });
		}
		const pair = new WebSocketPair();
		const [client, server] = Object.values(pair);
		this.ctx.acceptWebSocket(server);
		return new Response(null, { status: 101, webSocket: client });
	}

	private async consumeTicket(nonce: string, expiresAt: number): Promise<boolean> {
		return this.serialized(async () => {
			const key = `ticket:${nonce}`;
			if (await this.ctx.storage.get<number>(key)) return false;
			await this.ctx.storage.put(key, expiresAt);
			const currentAlarm = await this.ctx.storage.getAlarm();
			if (currentAlarm === null || expiresAt < currentAlarm) await this.ctx.storage.setAlarm(expiresAt);
			return true;
		});
	}

	async alarm(): Promise<void> {
		const now = Date.now();
		const entries = await this.ctx.storage.list<number>({ prefix: "ticket:" });
		let next: number | null = null;
		for (const [key, expiresAt] of entries) {
			if (expiresAt <= now) await this.ctx.storage.delete(key);
			else next = next === null ? expiresAt : Math.min(next, expiresAt);
		}
		if (next !== null) await this.ctx.storage.setAlarm(next);
	}

	private async schedule(input: ScheduleInput): Promise<{ ok: true; slot: Record<string, unknown>; status: string } | { ok: false; error: string; status: number }> {
		const roomName = input.roomName.trim();
		if (!roomName || !Number.isFinite(input.startsAtMs) || !Number.isFinite(input.endsAtMs) || input.endsAtMs <= input.startsAtMs) {
			return { ok: false, error: "Invalid schedule interval", status: 400 };
		}
		const submission = await this.env.DB.prepare("SELECT * FROM submissions WHERE id = ?").bind(input.submissionId).first<{
			id: string; event_id: string; status: string;
		}>();
		if (!submission) return { ok: false, error: "Submission not found", status: 404 };
		if (submission.event_id !== input.eventId) return { ok: false, error: "Submission does not belong to this event room", status: 404 };
		const event = await this.env.DB.prepare("SELECT timezone, start_day, end_day, day_start_minutes, day_end_minutes, slot_duration_minutes, track_conflict_policy, mode FROM events WHERE id = ?").bind(submission.event_id).first<{ timezone: string; start_day: string | null; end_day: string | null; day_start_minutes: number; day_end_minutes: number; slot_duration_minutes: number; track_conflict_policy: "hard" | "allow"; mode: "live" | "demo" }>();
		if (!event) return { ok: false, error: "Event not found", status: 404 };
		if (event.mode === "demo") return { ok: false, error: "This schedule is read-only", status: 403 };
		const boundsError = validateEventScheduleBounds(event, input.startsAtMs, input.endsAtMs);
		if (boundsError) return { ok: false, error: boundsError, status: 400 };
		if (!isSubmissionStatus(submission.status)) return { ok: false, error: "Unknown submission status", status: 500 };
		const current = await this.env.DB.prepare("SELECT id, ics_uid, created_at, track_id FROM agenda_slots WHERE submission_id = ?").bind(submission.id).first<{ id: string; ics_uid: string; created_at: number; track_id: string | null }>();
		const lifecycle = await this.env.DB.prepare("SELECT ics_uid, sequence FROM agenda_calendar_lifecycles WHERE event_id = ? AND submission_id = ?").bind(submission.event_id, submission.id).first<{ ics_uid: string; sequence: number }>();
		const room = await this.env.DB.prepare("SELECT id, name FROM event_rooms WHERE event_id = ? AND soft_deleted = 0 AND trim(name) = ?").bind(submission.event_id, roomName).first<{ id: string; name: string }>();
		const roomCount = await this.env.DB.prepare("SELECT COUNT(*) AS count FROM event_rooms WHERE event_id = ? AND soft_deleted = 0").bind(submission.event_id).first<{ count: number }>();
		if ((roomCount?.count ?? 0) > 0 && !room) return { ok: false, error: "Unknown room", status: 400 };
		const tracks = await this.env.DB.prepare("SELECT id, name FROM agenda_tracks WHERE event_id = ? AND soft_deleted = 0 ORDER BY position").bind(submission.event_id).all<{ id: string; name: string }>();
		const trackId = input.trackId === undefined ? current?.track_id ?? null : input.trackId;
		const track = trackId ? tracks.results.find((row) => row.id === trackId) : null;
		if (typeof input.trackId === "string" && !track) return { ok: false, error: "Choose an active agenda track", status: 400 };
		const candidateSpeakers = await this.speakers(submission.id);
		const candidate: ScheduleInterval = { submissionId: submission.id, roomId: room?.id ?? null, roomName, startsAtMs: input.startsAtMs, endsAtMs: input.endsAtMs, speakerKeys: candidateSpeakers };
		const slots = await this.env.DB.prepare("SELECT submission_id, room_id, room_name, track_id, starts_at, ends_at FROM agenda_slots WHERE event_id = ?").bind(submission.event_id).all<{ submission_id: string; room_id: string | null; room_name: string; track_id: string | null; starts_at: number; ends_at: number }>();
		if (event.track_conflict_policy === "hard" && track) {
			const conflict = slots.results.find((slot) => slot.submission_id !== submission.id && slot.track_id === track.id && slot.starts_at < input.endsAtMs && input.startsAtMs < slot.ends_at);
			if (conflict) return { ok: false, error: `Track conflict: "${track.name}" overlaps (${submission.id} vs ${conflict.submission_id})`, status: 409 };
		}
		const intervals: ScheduleInterval[] = [];
		for (const slot of slots.results) {
			intervals.push({ submissionId: slot.submission_id, roomId: slot.room_id, roomName: slot.room_name, startsAtMs: slot.starts_at, endsAtMs: slot.ends_at, speakerKeys: await this.speakers(slot.submission_id) });
		}
		const conflicts = detectConflicts(candidate, intervals);
		if (conflicts.length) return { ok: false, error: formatScheduleConflicts(conflicts), status: 409 };
		let status = submission.status;
		try { if (status !== "scheduled" && status !== "published") status = transitionSubmission(status, "scheduled"); }
		catch (error) { return { ok: false, error: error instanceof Error ? error.message : "Cannot schedule submission", status: 409 }; }
		const now = Date.now();
		const slot = current ?? { id: crypto.randomUUID(), ics_uid: lifecycle?.ics_uid ?? stableAgendaUid(submission.event_id, submission.id), created_at: now };
		const calendarSequence = lifecycle ? lifecycle.sequence + 1 : 0;
		await this.env.DB.batch([
			this.env.DB.prepare("UPDATE submissions SET status = ?, updated_at = ? WHERE id = ?").bind(status, now, submission.id),
			lifecycle
				? this.env.DB.prepare("UPDATE agenda_calendar_lifecycles SET sequence = ?, updated_at = ? WHERE event_id = ? AND submission_id = ?").bind(calendarSequence, now, submission.event_id, submission.id)
				: this.env.DB.prepare("INSERT INTO agenda_calendar_lifecycles (event_id, submission_id, ics_uid, sequence, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)").bind(submission.event_id, submission.id, slot.ics_uid, calendarSequence, now, now),
			current
				? this.env.DB.prepare("UPDATE agenda_slots SET room_id = ?, room_name = ?, track_id = ?, starts_at = ?, ends_at = ?, updated_at = ? WHERE id = ?").bind(room?.id ?? null, roomName, trackId, input.startsAtMs, input.endsAtMs, now, slot.id)
				: this.env.DB.prepare("INSERT INTO agenda_slots (id, event_id, submission_id, room_id, track_id, room_name, starts_at, ends_at, ics_uid, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").bind(slot.id, submission.event_id, submission.id, room?.id ?? null, trackId, roomName, input.startsAtMs, input.endsAtMs, slot.ics_uid, now, now),
		]);
		this.broadcast(JSON.stringify({ type: "invalidate", reason: "schedule.mutate", eventId: submission.event_id, at: now }));
		return { ok: true, status, slot: { ...slot, event_id: submission.event_id, submission_id: submission.id, room_id: room?.id ?? null, track_id: trackId, room_name: roomName, starts_at: input.startsAtMs, ends_at: input.endsAtMs, updated_at: now, calendar_sequence: calendarSequence } };
	}

	private async configure(eventId: string, mutation: ConfigurationMutation): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
		const event = await this.env.DB.prepare("SELECT mode FROM events WHERE id = ?").bind(eventId).first<{ mode: "live" | "demo" }>();
		if (!event) return { ok: false, error: "Event not found", status: 404 };
		if (event.mode === "demo") return { ok: false, error: "This event is read-only", status: 403 };
		try {
			if (mutation.action === "event-settings") await updateEventConfiguration(this.env.DB, eventId, mutation.input);
			else if (mutation.action === "room-update") await updateRoom(this.env.DB, eventId, mutation.id, mutation.name);
			else await deleteRoom(this.env.DB, eventId, mutation.id);
		} catch (error) {
			return { ok: false, error: error instanceof Error ? error.message : "Configuration update failed", status: error instanceof Error && "status" in error && typeof error.status === "number" ? error.status : 400 };
		}
		this.broadcast(JSON.stringify({ type: "invalidate", reason: `configuration.${mutation.action}`, eventId, at: Date.now() }));
		return { ok: true };
	}

	private async scheduleAction(eventId: string, submissionId: string, action: ScheduleAction): Promise<{ ok: true; status: string; slot?: Record<string, unknown> } | { ok: false; error: string; status: number }> {
		const submission = await this.env.DB.prepare("SELECT id, event_id, status, content_status FROM submissions WHERE id = ?").bind(submissionId).first<{ id: string; event_id: string; status: string; content_status: string }>();
		if (!submission || submission.event_id !== eventId) return { ok: false, error: "Submission not found", status: 404 };
		const event = await this.env.DB.prepare("SELECT mode FROM events WHERE id = ?").bind(eventId).first<{ mode: "live" | "demo" }>();
		if (!event) return { ok: false, error: "Event not found", status: 404 };
		if (event.mode === "demo") return { ok: false, error: "This schedule is read-only", status: 403 };
		const now = Date.now();
		if (action === "unplace") {
			if (submission.status !== "scheduled" && submission.status !== "published") return { ok: false, error: "Only scheduled submissions can be unplaced", status: 409 };
			const slot = await this.env.DB.prepare("SELECT id, room_name, starts_at, ends_at, ics_uid FROM agenda_slots WHERE submission_id = ?").bind(submission.id).first<{ id: string; room_name: string; starts_at: number; ends_at: number; ics_uid: string }>();
			if (!slot) return { ok: false, error: "Scheduled session is missing its calendar slot", status: 409 };
			const lifecycle = await this.env.DB.prepare("SELECT ics_uid, sequence FROM agenda_calendar_lifecycles WHERE event_id = ? AND submission_id = ?").bind(eventId, submission.id).first<{ ics_uid: string; sequence: number }>();
			const calendarSequence = (lifecycle?.sequence ?? 0) + 1;
			await this.env.DB.batch([
				lifecycle
					? this.env.DB.prepare("UPDATE agenda_calendar_lifecycles SET sequence = ?, updated_at = ? WHERE event_id = ? AND submission_id = ?").bind(calendarSequence, now, eventId, submission.id)
					: this.env.DB.prepare("INSERT INTO agenda_calendar_lifecycles (event_id, submission_id, ics_uid, sequence, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)").bind(eventId, submission.id, slot.ics_uid, calendarSequence, now, now),
				this.env.DB.prepare("DELETE FROM agenda_slots WHERE submission_id = ?").bind(submission.id),
				this.env.DB.prepare("UPDATE submissions SET status = 'accepted', updated_at = ? WHERE id = ?").bind(now, submission.id),
			]);
			this.broadcast(JSON.stringify({ type: "invalidate", reason: "schedule.unplace", eventId, at: now }));
			return { ok: true, status: "accepted", slot: { ...slot, ics_uid: lifecycle?.ics_uid ?? slot.ics_uid, calendar_sequence: calendarSequence } };
		}
		const target = action === "publish" ? "published" : "scheduled";
		if (action === "publish") {
			const head = await this.env.DB.prepare("SELECT approved_revision_id FROM content_heads WHERE event_id = ? AND entity_type = 'session' AND entity_id = ?").bind(eventId, submission.id).first<{ approved_revision_id: string | null }>();
			if (submission.content_status !== "approved" || !head?.approved_revision_id) return { ok: false, error: "Approve session content before publishing", status: 409 };
		}
		if (!isSubmissionStatus(submission.status) || (action === "publish" && submission.status !== "scheduled") || (action === "unpublish" && submission.status !== "published")) {
			return { ok: false, error: `Cannot ${action} this submission`, status: 409 };
		}
		await this.env.DB.batch([
			this.env.DB.prepare("UPDATE submissions SET status = ?, updated_at = ? WHERE id = ?").bind(target, now, submission.id),
		]);
		this.broadcast(JSON.stringify({ type: "invalidate", reason: `schedule.${action}`, eventId, at: now }));
		return { ok: true, status: target };
	}

	/** Publication shares the exact queue used by place/move/unplace. Validation
	 * and status writes therefore observe one coherent agenda snapshot. */
	private async bulkPublication(input: BulkPublicationInput): Promise<{ ok: true; changed: number } | { ok: false; error: string; status: number }> {
		const ids = [...new Set(input.submissionIds)];
		if (ids.length === 0 || ids.length > 100) return { ok: false, error: "Choose between 1 and 100 sessions", status: 400 };
		const event = await this.env.DB.prepare("SELECT mode FROM events WHERE id = ?").bind(input.eventId).first<{ mode: "live" | "demo" }>();
		if (!event) return { ok: false, error: "Event not found", status: 404 };
		if (event.mode === "demo") return { ok: false, error: "This schedule is read-only", status: 403 };
		const placeholders = ids.map(() => "?").join(", ");
		const rows = await this.env.DB.prepare(`SELECT s.id, s.status, s.content_status, h.approved_revision_id, a.id AS slot_id FROM submissions s LEFT JOIN agenda_slots a ON a.submission_id = s.id AND a.event_id = s.event_id LEFT JOIN content_heads h ON h.event_id = s.event_id AND h.entity_type = 'session' AND h.entity_id = s.id WHERE s.event_id = ? AND s.id IN (${placeholders})`).bind(input.eventId, ...ids).all<{ id: string; status: string; content_status: string; approved_revision_id: string | null; slot_id: string | null }>();
		if (rows.results.length !== ids.length) return { ok: false, error: "One or more sessions are outside this event or no longer exist", status: 404 };
		if (input.action === "publish") {
			if (rows.results.some((row) => row.status !== "scheduled" || !row.slot_id || row.content_status !== "approved" || !row.approved_revision_id)) return { ok: false, error: "Only approved scheduled sessions with an agenda slot can be published", status: 409 };
		} else if (rows.results.some((row) => row.status !== "published")) {
			return { ok: false, error: "Only published sessions can be unpublished", status: 409 };
		}
		const now = Date.now();
		await this.env.DB.prepare(`UPDATE submissions SET status = ?, updated_at = ? WHERE event_id = ? AND id IN (${placeholders})`).bind(input.action === "publish" ? "published" : "scheduled", now, input.eventId, ...ids).run();
		this.broadcast(JSON.stringify({ type: "invalidate", reason: `schedule.bulk-${input.action}`, eventId: input.eventId, at: now }));
		return { ok: true, changed: ids.length };
	}

	private async speakers(submissionId: string): Promise<string[]> {
		const rows = await this.env.DB.prepare("SELECT email FROM submission_speakers WHERE submission_id = ? AND status IN ('pending', 'confirmed')").bind(submissionId).all<{ email: string }>();
		return rows.results.map((row) => normalizeSpeakerKey(row.email));
	}

	broadcast(json: string): void {
		for (const ws of this.ctx.getWebSockets()) { try { ws.send(json); } catch { /* close cleanup is hibernatable */ } }
	}

	async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> { if (message === "ping") ws.send("pong"); }
	async webSocketClose(ws: WebSocket, code: number, reason: string): Promise<void> { ws.close(code, reason); }
}

async function parseScheduleRequest(request: Request): Promise<ScheduleInput | null> {
	let value: unknown;
	try { value = await request.json(); } catch { return null; }
	if (!value || typeof value !== "object" || Array.isArray(value)) return null;
	const body = value as Record<string, unknown>;
	const eventId = request.headers.get("x-ce-event-id") ?? "";
	if (typeof body.submissionId !== "string" || typeof body.roomName !== "string" || typeof body.startsAtMs !== "number" || typeof body.endsAtMs !== "number" || !eventId) return null;
	if ("trackId" in body && typeof body.trackId !== "string" && body.trackId !== null) return null;
	return { eventId, submissionId: body.submissionId, roomName: body.roomName, trackId: "trackId" in body ? body.trackId as string | null : undefined, startsAtMs: body.startsAtMs, endsAtMs: body.endsAtMs };
}

async function parseBulkPublicationRequest(request: Request): Promise<BulkPublicationInput | null> {
	let value: unknown;
	try { value = await request.json(); } catch { return null; }
	if (!value || typeof value !== "object" || Array.isArray(value)) return null;
	const body = value as Record<string, unknown>;
	const eventId = request.headers.get("x-ce-event-id") ?? "";
	if (!eventId || (body.action !== "publish" && body.action !== "unpublish") || !Array.isArray(body.sessionIds) || body.sessionIds.some((id) => typeof id !== "string" || id.length === 0 || id.length > 128)) return null;
	return { eventId, action: body.action, submissionIds: body.sessionIds };
}

async function parseConfigurationMutation(request: Request): Promise<ConfigurationMutation | null> {
	let value: unknown;
	try { value = await request.json(); } catch { return null; }
	if (!value || typeof value !== "object" || Array.isArray(value)) return null;
	const body = value as Record<string, unknown>;
	if (body.action === "event-settings" && body.input && typeof body.input === "object" && !Array.isArray(body.input)) return { action: body.action, input: body.input as Record<string, unknown> };
	if (body.action === "room-update") return { action: body.action, id: body.id, name: body.name };
	if (body.action === "room-delete") return { action: body.action, id: body.id };
	return null;
}
