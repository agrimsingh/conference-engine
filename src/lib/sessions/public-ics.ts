import { buildIcsInvite, calendarSessionLabel } from "@/lib/email/ics";
import { titleFromAnswersJson } from "@/lib/email/notify";
import { loadPublicSession } from "@/lib/sessions/session";

export type PublicIcsResult =
	| { ok: true; filename: string; body: string; contentType: string }
	| { ok: false; status: 404 };

export async function buildPublicSessionIcs(
	db: D1Database,
	args: { eventSlug: string; sessionId: string; organizerEmail: string },
): Promise<PublicIcsResult> {
	const session = await loadPublicSession(db, args.eventSlug, args.sessionId);
	if (!session) return { ok: false, status: 404 };

	const lifecycle = await db
		.prepare(
			`SELECT ics_uid, sequence
       FROM agenda_calendar_lifecycles
       WHERE event_id = ? AND submission_id = ?`,
		)
		.bind(session.event.id, session.submission.id)
		.first<{ ics_uid: string; sequence: number }>();

	const slotMeta = await db
		.prepare(
			`SELECT ics_uid FROM agenda_slots WHERE id = ? AND event_id = ?`,
		)
		.bind(session.slot.id, session.event.id)
		.first<{ ics_uid: string }>();

	const icsUid = lifecycle?.ics_uid ?? slotMeta?.ics_uid;
	if (!icsUid) return { ok: false, status: 404 };

	const title = titleFromAnswersJson(session.submission.answers_json);
	const body = buildIcsInvite({
		uid: icsUid,
		summary: calendarSessionLabel(title, session.event.name),
		description: `Published session at ${session.event.name}`,
		location: session.slot.roomName,
		startsAtMs: session.slot.startsAt,
		endsAtMs: session.slot.endsAt,
		organizerEmail: args.organizerEmail,
		method: "PUBLISH",
		sequence: lifecycle?.sequence ?? 0,
	});

	const safeSlug = title
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-|-$/g, "")
		.slice(0, 48) || "session";

	return {
		ok: true,
		filename: `${safeSlug}.ics`,
		body,
		contentType: "text/calendar; method=PUBLISH; charset=utf-8",
	};
}
