import { getEventBySlug } from "@/lib/db/queries";
import { titleFromAnswers } from "@/lib/domain";
import { toIcsUtc } from "@/lib/email/ics";

export type PublicItineraryIcsResult =
	| { ok: true; filename: string; body: string; contentType: string }
	| { ok: false; status: 400 | 404 };

type ItineraryRow = {
	id: string;
	answers_json: string;
	room_name: string;
	starts_at: number;
	ends_at: number;
	ics_uid: string;
};

function parseAnswers(raw: string): Record<string, unknown> {
	try {
		const parsed: unknown = JSON.parse(raw);
		return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
			? parsed as Record<string, unknown>
			: {};
	} catch {
		return {};
	}
}

function escapeIcsText(value: string): string {
	return value
		.replace(/\\/g, "\\\\")
		.replace(/\r?\n/g, "\\n")
		.replace(/,/g, "\\,")
		.replace(/;/g, "\\;");
}

function foldLine(line: string): string {
	if (line.length <= 75) return line;
	const parts = [line.slice(0, 75)];
	let rest = line.slice(75);
	while (rest.length > 0) {
		parts.push(` ${rest.slice(0, 74)}`);
		rest = rest.slice(74);
	}
	return parts.join("\r\n");
}

export async function buildPublicItineraryIcs(
	db: D1Database,
	args: { eventSlug: string; sessionIds: readonly string[]; dtstampMs?: number },
): Promise<PublicItineraryIcsResult> {
	const sessionIds = [...new Set(args.sessionIds)];
	if (sessionIds.length === 0 || sessionIds.length > 100) return { ok: false, status: 400 };

	const event = await getEventBySlug(db, args.eventSlug);
	if (!event) return { ok: false, status: 404 };

	const rows = await db.prepare(
		`SELECT s.id, cr.snapshot_json AS answers_json, a.room_name, a.starts_at, a.ends_at, a.ics_uid
		 FROM submissions s
		 INNER JOIN agenda_slots a ON a.submission_id = s.id AND a.event_id = s.event_id
		 INNER JOIN content_heads h ON h.event_id = s.event_id AND h.entity_type = 'session' AND h.entity_id = s.id AND h.approved_revision_id IS NOT NULL
		 INNER JOIN content_revisions cr ON cr.id = h.approved_revision_id AND cr.event_id = s.event_id
		 WHERE s.event_id = ? AND s.status = 'published' AND s.id IN (SELECT value FROM json_each(?))`,
	).bind(event.id, JSON.stringify(sessionIds)).all<ItineraryRow>();

	// A stale, unpublished, or cross-event id invalidates the whole export.
	if (rows.results.length !== sessionIds.length) return { ok: false, status: 404 };

	const dtstamp = toIcsUtc(args.dtstampMs ?? Date.now());
	const events = [...rows.results]
		.sort((a, b) => a.starts_at - b.starts_at || a.id.localeCompare(b.id))
		.flatMap((row) => [
			"BEGIN:VEVENT",
			`UID:${row.ics_uid}`,
			`DTSTAMP:${dtstamp}`,
			`DTSTART:${toIcsUtc(row.starts_at)}`,
			`DTEND:${toIcsUtc(row.ends_at)}`,
			`SUMMARY:${escapeIcsText(titleFromAnswers(parseAnswers(row.answers_json)))}`,
			`DESCRIPTION:${escapeIcsText(`Published session at ${event.name}`)}`,
			`LOCATION:${escapeIcsText(row.room_name)}`,
			"STATUS:CONFIRMED",
			"TRANSP:OPAQUE",
			"END:VEVENT",
		]);
	const lines = [
		"BEGIN:VCALENDAR",
		"PRODID:-//conference-engine//EN",
		"VERSION:2.0",
		"CALSCALE:GREGORIAN",
		"METHOD:PUBLISH",
		...events,
		"END:VCALENDAR",
	];
	const safeSlug = event.slug.replace(/[^a-z0-9-]+/gi, "-").replace(/^-|-$/g, "") || "event";
	return {
		ok: true,
		filename: `${safeSlug}-my-schedule.ics`,
		body: `${lines.map(foldLine).join("\r\n")}\r\n`,
		contentType: "text/calendar; method=PUBLISH; charset=utf-8",
	};
}
