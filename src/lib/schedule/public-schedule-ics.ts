import { getEventBySlug } from "@/lib/db/queries";
import { titleFromAnswers } from "@/lib/domain";
import { buildIcsPublishCalendar } from "@/lib/email/ics";

export type PublicScheduleIcsResult =
	| { ok: true; filename: string; body: string; contentType: string }
	| { ok: false; status: 404 };

type ScheduleIcsRow = {
	id: string;
	answers_json: string;
	room_name: string;
	starts_at: number;
	ends_at: number;
	ics_uid: string;
	sequence: number;
};

function parseAnswers(raw: string): Record<string, unknown> {
	try {
		const parsed: unknown = JSON.parse(raw);
		return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
			? (parsed as Record<string, unknown>)
			: {};
	} catch {
		return {};
	}
}

/** Full published agenda as a subscribable METHOD:PUBLISH calendar. */
export async function buildPublicScheduleIcs(
	db: D1Database,
	args: { eventSlug: string; organizerEmail: string; dtstampMs?: number },
): Promise<PublicScheduleIcsResult> {
	const event = await getEventBySlug(db, args.eventSlug);
	if (!event) return { ok: false, status: 404 };

	const rows = await db
		.prepare(
			`SELECT s.id,
			        cr.snapshot_json AS answers_json,
			        a.room_name,
			        a.starts_at,
			        a.ends_at,
			        COALESCE(l.ics_uid, a.ics_uid) AS ics_uid,
			        COALESCE(l.sequence, 0) AS sequence
			 FROM submissions s
			 INNER JOIN agenda_slots a ON a.submission_id = s.id AND a.event_id = s.event_id
			 INNER JOIN content_heads h
			   ON h.event_id = s.event_id
			  AND h.entity_type = 'session'
			  AND h.entity_id = s.id
			  AND h.approved_revision_id IS NOT NULL
			 INNER JOIN content_revisions cr ON cr.id = h.approved_revision_id AND cr.event_id = s.event_id
			 LEFT JOIN agenda_calendar_lifecycles l
			   ON l.event_id = s.event_id AND l.submission_id = s.id
			 WHERE s.event_id = ? AND s.status = 'published' AND s.agenda_visibility = 'public'
			 ORDER BY a.starts_at ASC, s.id ASC`,
		)
		.bind(event.id)
		.all<ScheduleIcsRow>();

	const body = buildIcsPublishCalendar({
		calendarName: event.name,
		dtstampMs: args.dtstampMs,
		events: rows.results.map((row) => ({
			uid: row.ics_uid,
			summary: titleFromAnswers(parseAnswers(row.answers_json)),
			description: `Published session at ${event.name}`,
			location: row.room_name,
			startsAtMs: row.starts_at,
			endsAtMs: row.ends_at,
			organizerEmail: args.organizerEmail,
			sequence: row.sequence,
		})),
	});

	const safeSlug = event.slug.replace(/[^a-z0-9-]+/gi, "-").replace(/^-|-$/g, "") || "event";
	return {
		ok: true,
		filename: `${safeSlug}-schedule.ics`,
		body,
		contentType: "text/calendar; method=PUBLISH; charset=utf-8",
	};
}
