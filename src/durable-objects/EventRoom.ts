import { DurableObject } from "cloudflare:workers";
import { detectConflicts, formatScheduleConflicts, isSubmissionStatus, normalizeSpeakerKey, transitionSubmission, type ScheduleInterval } from "@/lib/domain";
import { stableAgendaUid } from "@/lib/email/ics";
import { isScheduleAction, type ScheduleAction } from "@/lib/schedule/actions";

type ScheduleInput = { eventId: string; submissionId: string; startsAtMs: number; endsAtMs: number; roomName: string };

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
		if (!isSubmissionStatus(submission.status)) return { ok: false, error: "Unknown submission status", status: 500 };
		const room = await this.env.DB.prepare("SELECT id, name FROM event_rooms WHERE event_id = ? AND trim(name) = ?").bind(submission.event_id, roomName).first<{ id: string; name: string }>();
		const roomCount = await this.env.DB.prepare("SELECT COUNT(*) AS count FROM event_rooms WHERE event_id = ?").bind(submission.event_id).first<{ count: number }>();
		if ((roomCount?.count ?? 0) > 0 && !room) return { ok: false, error: "Unknown room", status: 400 };
		const candidateSpeakers = await this.speakers(submission.id);
		const candidate: ScheduleInterval = { submissionId: submission.id, roomName, startsAtMs: input.startsAtMs, endsAtMs: input.endsAtMs, speakerKeys: candidateSpeakers };
		const slots = await this.env.DB.prepare("SELECT submission_id, room_name, starts_at, ends_at FROM agenda_slots WHERE event_id = ?").bind(submission.event_id).all<{ submission_id: string; room_name: string; starts_at: number; ends_at: number }>();
		const intervals: ScheduleInterval[] = [];
		for (const slot of slots.results) {
			intervals.push({ submissionId: slot.submission_id, roomName: slot.room_name, startsAtMs: slot.starts_at, endsAtMs: slot.ends_at, speakerKeys: await this.speakers(slot.submission_id) });
		}
		const conflicts = detectConflicts(candidate, intervals);
		if (conflicts.length) return { ok: false, error: formatScheduleConflicts(conflicts), status: 409 };
		let status = submission.status;
		try { if (status !== "scheduled" && status !== "published") status = transitionSubmission(status, "scheduled"); }
		catch (error) { return { ok: false, error: error instanceof Error ? error.message : "Cannot schedule submission", status: 409 }; }
		const now = Date.now();
		const current = await this.env.DB.prepare("SELECT id, ics_uid, created_at FROM agenda_slots WHERE submission_id = ?").bind(submission.id).first<{ id: string; ics_uid: string; created_at: number }>();
		const slot = current ?? { id: crypto.randomUUID(), ics_uid: stableAgendaUid(submission.event_id, submission.id), created_at: now };
		await this.env.DB.batch([
			this.env.DB.prepare("UPDATE submissions SET status = ?, updated_at = ? WHERE id = ?").bind(status, now, submission.id),
			current
				? this.env.DB.prepare("UPDATE agenda_slots SET room_id = ?, room_name = ?, starts_at = ?, ends_at = ?, updated_at = ? WHERE id = ?").bind(room?.id ?? null, roomName, input.startsAtMs, input.endsAtMs, now, slot.id)
				: this.env.DB.prepare("INSERT INTO agenda_slots (id, event_id, submission_id, room_id, room_name, starts_at, ends_at, ics_uid, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").bind(slot.id, submission.event_id, submission.id, room?.id ?? null, roomName, input.startsAtMs, input.endsAtMs, slot.ics_uid, now, now),
		]);
		this.broadcast(JSON.stringify({ type: "invalidate", reason: "schedule.mutate", eventId: submission.event_id, at: now }));
		return { ok: true, status, slot: { ...slot, event_id: submission.event_id, submission_id: submission.id, room_id: room?.id ?? null, room_name: roomName, starts_at: input.startsAtMs, ends_at: input.endsAtMs, updated_at: now } };
	}

	private async scheduleAction(eventId: string, submissionId: string, action: ScheduleAction): Promise<{ ok: true; status: string } | { ok: false; error: string; status: number }> {
		const submission = await this.env.DB.prepare("SELECT id, event_id, status FROM submissions WHERE id = ?").bind(submissionId).first<{ id: string; event_id: string; status: string }>();
		if (!submission || submission.event_id !== eventId) return { ok: false, error: "Submission not found", status: 404 };
		const now = Date.now();
		if (action === "unplace") {
			if (submission.status !== "scheduled" && submission.status !== "published") return { ok: false, error: "Only scheduled submissions can be unplaced", status: 409 };
			await this.env.DB.batch([
				this.env.DB.prepare("DELETE FROM agenda_slots WHERE submission_id = ?").bind(submission.id),
				this.env.DB.prepare("UPDATE submissions SET status = 'accepted', updated_at = ? WHERE id = ?").bind(now, submission.id),
			]);
			this.broadcast(JSON.stringify({ type: "invalidate", reason: "schedule.unplace", eventId, at: now }));
			return { ok: true, status: "accepted" };
		}
		const target = action === "publish" ? "published" : "scheduled";
		if (!isSubmissionStatus(submission.status) || (action === "publish" && submission.status !== "scheduled") || (action === "unpublish" && submission.status !== "published")) {
			return { ok: false, error: `Cannot ${action} this submission`, status: 409 };
		}
		await this.env.DB.batch([
			this.env.DB.prepare("UPDATE submissions SET status = ?, updated_at = ? WHERE id = ?").bind(target, now, submission.id),
		]);
		this.broadcast(JSON.stringify({ type: "invalidate", reason: `schedule.${action}`, eventId, at: now }));
		return { ok: true, status: target };
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
	return typeof body.submissionId === "string" && typeof body.roomName === "string" && typeof body.startsAtMs === "number" && typeof body.endsAtMs === "number" && eventId
		? { eventId, submissionId: body.submissionId, roomName: body.roomName, startsAtMs: body.startsAtMs, endsAtMs: body.endsAtMs } : null;
}
