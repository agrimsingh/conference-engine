import { NextResponse } from "next/server";
import { authorizeWritableEventAdminApi, type EventAdminAccess } from "@/lib/auth/admin";
import { getCloudflareEnv, getDb } from "@/lib/db/cloudflare";
import { getSubmissionById } from "@/lib/db/queries";
import { notifyCalendarCancellation, notifyCalendarInvite } from "@/lib/email/notify";
import { isScheduleAction, type ScheduleAction } from "@/lib/schedule/actions";
import { validateEventScheduleBounds } from "@/lib/schedule/date-bounds";
import { readScheduleJson } from "@/lib/schedule/request";

type RouteContext = { params: Promise<{ eventSlug: string; submissionId: string }> };

function parseTime(value: unknown): number | null {
	if (typeof value === "number" && Number.isFinite(value)) return value;
	if (typeof value === "string" && value.trim()) {
		const parsed = Date.parse(value);
		return Number.isNaN(parsed) ? null : parsed;
	}
	return null;
}

function parseTrackId(body: Record<string, unknown>): { ok: true; trackId?: string | null } | { ok: false } {
	if (!("trackId" in body)) return { ok: true };
	if (typeof body.trackId === "string" || body.trackId === null) return { ok: true, trackId: body.trackId };
	return { ok: false };
}

export async function POST(request: Request, context: RouteContext) {
	const authorized = await authorizeSchedule(context);
	if (!authorized.ok) return authorized.response;
	const { db, access, submissionId } = authorized;
	const parsed = await readScheduleJson(request);
	if (!parsed.ok) return NextResponse.json({ ok: false, error: parsed.error }, { status: parsed.status });
	const body = parsed.body;
	const startsAtMs = parseTime(body.startsAt);
	const endsAtMs = parseTime(body.endsAt);
	const roomName = typeof body.roomName === "string" ? body.roomName : "";
	const parsedTrack = parseTrackId(body);
	if (startsAtMs === null || endsAtMs === null) return NextResponse.json({ ok: false, error: "startsAt and endsAt required (ISO or ms)" }, { status: 400 });
	if (!parsedTrack.ok) return NextResponse.json({ ok: false, error: "trackId must be a string or null" }, { status: 400 });
	const boundsError = validateEventScheduleBounds(access.event, startsAtMs, endsAtMs);
	if (boundsError) return NextResponse.json({ ok: false, error: boundsError }, { status: 400 });
	const submission = await getSubmissionById(db, submissionId);
	if (!submission || submission.event_id !== access.event.id) return NextResponse.json({ ok: false, error: "Submission not found" }, { status: 404 });
	const env = await getCloudflareEnv();
	if (!env.EVENT_ROOM) return NextResponse.json({ ok: false, error: "EVENT_ROOM binding unavailable" }, { status: 503 });
	const mutationResponse = await env.EVENT_ROOM.getByName(access.event.id).fetch("https://event-room/schedule", {
		method: "POST",
		headers: { "content-type": "application/json", "x-ce-event-id": access.event.id },
		body: JSON.stringify({ submissionId, startsAtMs, endsAtMs, roomName, ...(parsedTrack.trackId === undefined ? {} : { trackId: parsedTrack.trackId }) }),
	});
	const result: unknown = await mutationResponse.json();
	if (!result || typeof result !== "object" || Array.isArray(result)) return NextResponse.json({ ok: false, error: "Invalid room response" }, { status: 502 });
	const value = result as Record<string, unknown>;
	if (value.ok !== true) return NextResponse.json({ ok: false, error: typeof value.error === "string" ? value.error : "Schedule mutation failed" }, { status: mutationResponse.status });
	const slot = value.slot as { room_name: string; starts_at: number; ends_at: number; ics_uid: string; calendar_sequence: number };
	const emailResult = await notifyCalendarInvite(db, {
		submissionId,
		roomName: slot.room_name,
		startsAtMs: slot.starts_at,
		endsAtMs: slot.ends_at,
		icsUid: slot.ics_uid,
		sequence: slot.calendar_sequence,
		fromEmail: env.RESEND_FROM_EMAIL || "team@65labs.org",
	});
	return NextResponse.json({
		ok: true,
		status: value.status,
		slot: value.slot,
		email: emailResult.email,
		broadcasted: true,
		icsPreview: emailResult.icsBytes.slice(0, 200).replace(/\r?\n/g, "\\n"),
		icsBytesLength: emailResult.icsBytes.length,
	});
}

export async function DELETE(_request: Request, context: RouteContext) {
	return mutateAction("unplace", context);
}

export async function PATCH(request: Request, context: RouteContext) {
	const authorized = await authorizeSchedule(context);
	if (!authorized.ok) return authorized.response;
	const parsed = await readScheduleJson(request);
	if (!parsed.ok) return NextResponse.json({ ok: false, error: parsed.error }, { status: parsed.status });
	const body = parsed.body;
	const action = body.action;
	if (!isScheduleAction(action) || action === "unplace") return NextResponse.json({ ok: false, error: "action must be publish or unpublish" }, { status: 400 });
	if ("approveContent" in body && typeof body.approveContent !== "boolean") return NextResponse.json({ ok: false, error: "approveContent must be a boolean" }, { status: 400 });
	return mutateAction(action, context, authorized, body.approveContent === true);
}

async function mutateAction(
	action: ScheduleAction,
	context: RouteContext,
	authorized?: Extract<Awaited<ReturnType<typeof authorizeSchedule>>, { ok: true }>,
	approveContent = false,
): Promise<NextResponse> {
	const resolved = authorized ?? await authorizeSchedule(context);
	if (!resolved.ok) return resolved.response;
	const { db, access, submissionId } = resolved;
	const submission = await getSubmissionById(db, submissionId);
	if (!submission || submission.event_id !== access.event.id) return NextResponse.json({ ok: false, error: "Submission not found" }, { status: 404 });
	const env = await getCloudflareEnv();
	if (!env.EVENT_ROOM) return NextResponse.json({ ok: false, error: "EVENT_ROOM binding unavailable" }, { status: 503 });
	const response = await env.EVENT_ROOM.getByName(access.event.id).fetch("https://event-room/schedule", {
		method: action === "unplace" ? "DELETE" : "PATCH",
		headers: { "content-type": "application/json", "x-ce-event-id": access.event.id },
		body: JSON.stringify({ submissionId, action, ...(action === "publish" ? { approveContent } : {}) }),
	});
	const value: unknown = await response.json();
	if (!value || typeof value !== "object" || Array.isArray(value)) return NextResponse.json({ ok: false, error: "Invalid room response" }, { status: 502 });
	const result = value as Record<string, unknown>;
	if (result.ok !== true) return NextResponse.json({ ok: false, error: typeof result.error === "string" ? result.error : "Schedule mutation failed" }, { status: response.status });
	const slot = result.slot as { room_name?: string; starts_at?: number; ends_at?: number; ics_uid?: string; calendar_sequence?: number } | undefined;
	const cancellation = action === "unplace" && slot && typeof slot.room_name === "string" && typeof slot.starts_at === "number" && typeof slot.ends_at === "number" && typeof slot.ics_uid === "string" && typeof slot.calendar_sequence === "number"
		? await notifyCalendarCancellation(db, { submissionId, roomName: slot.room_name, startsAtMs: slot.starts_at, endsAtMs: slot.ends_at, icsUid: slot.ics_uid, sequence: slot.calendar_sequence, fromEmail: env.RESEND_FROM_EMAIL || "team@65labs.org" })
		: null;
	return NextResponse.json({ ok: true, status: result.status, broadcasted: true, email: cancellation?.email ?? null, icsBytesLength: cancellation?.icsBytes.length ?? 0 });
}

async function authorizeSchedule(context: RouteContext): Promise<
	| { ok: true; db: D1Database; access: EventAdminAccess; submissionId: string }
	| { ok: false; response: NextResponse }
> {
	const { eventSlug, submissionId } = await context.params;
	const db = await getDb();
	const authorization = await authorizeWritableEventAdminApi(db, eventSlug);
	if (!authorization.ok) return { ok: false, response: authorization.response };
	return { ok: true, db, access: authorization.access, submissionId };
}
