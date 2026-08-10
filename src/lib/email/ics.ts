export type IcsEventInput = {
	uid: string;
	summary: string;
	description?: string;
	location: string;
	startsAtMs: number;
	endsAtMs: number;
	organizerEmail: string;
	/** Required for REQUEST/CANCEL invites; omitted for public METHOD:PUBLISH downloads. */
	attendeeEmail?: string;
	method?: "REQUEST" | "CANCEL" | "PUBLISH";
	/** RFC 5545 sequence increases when an existing meeting is revised. */
	sequence?: number;
	dtstampMs?: number;
};

function pad(n: number): string {
	return n.toString().padStart(2, "0");
}

export function toIcsUtc(ms: number): string {
	const d = new Date(ms);
	return (
		`${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}` +
		`T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`
	);
}

function foldLine(line: string): string {
	if (line.length <= 75) return line;
	const parts: string[] = [];
	parts.push(line.slice(0, 75));
	let rest = line.slice(75);
	while (rest.length > 0) {
		parts.push(` ${rest.slice(0, 74)}`);
		rest = rest.slice(74);
	}
	return parts.join("\r\n");
}

function escapeText(value: string): string {
	return value
		.replace(/\\/g, "\\\\")
		.replace(/\n/g, "\\n")
		.replace(/,/g, "\\,")
		.replace(/;/g, "\\;");
}

export type IcsPublishEventInput = Omit<IcsEventInput, "method" | "attendeeEmail" | "dtstampMs">;

function veventLines(
	input: IcsPublishEventInput & {
		method: "REQUEST" | "CANCEL" | "PUBLISH";
		attendeeEmail?: string;
		dtstamp: string;
	},
): string[] {
	const cancelled = input.method === "CANCEL";
	const attendee =
		input.method === "PUBLISH" || !input.attendeeEmail
			? null
			: `ATTENDEE;CN=${escapeText(input.attendeeEmail)};CUTYPE=INDIVIDUAL;ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE:mailto:${input.attendeeEmail}`;
	return [
		"BEGIN:VEVENT",
		`UID:${input.uid}`,
		`DTSTAMP:${input.dtstamp}`,
		`DTSTART:${toIcsUtc(input.startsAtMs)}`,
		`DTEND:${toIcsUtc(input.endsAtMs)}`,
		`SUMMARY:${escapeText(input.summary)}`,
		`LOCATION:${escapeText(input.location)}`,
		input.description ? `DESCRIPTION:${escapeText(input.description)}` : null,
		`ORGANIZER;CN=conference-engine:mailto:${input.organizerEmail}`,
		attendee,
		`STATUS:${cancelled ? "CANCELLED" : "CONFIRMED"}`,
		`SEQUENCE:${Math.max(0, Math.floor(input.sequence ?? 0))}`,
		"TRANSP:OPAQUE",
		"END:VEVENT",
	].filter((line): line is string => line !== null);
}

export function buildIcsInvite(input: IcsEventInput): string {
	const method = input.method ?? "REQUEST";
	const dtstamp = toIcsUtc(input.dtstampMs ?? Date.now());
	const lines = [
		"BEGIN:VCALENDAR",
		"PRODID:-//conference-engine//EN",
		"VERSION:2.0",
		"CALSCALE:GREGORIAN",
		`METHOD:${method}`,
		...veventLines({
			uid: input.uid,
			summary: input.summary,
			description: input.description,
			location: input.location,
			startsAtMs: input.startsAtMs,
			endsAtMs: input.endsAtMs,
			organizerEmail: input.organizerEmail,
			sequence: input.sequence,
			method,
			attendeeEmail: input.attendeeEmail,
			dtstamp,
		}),
		"END:VCALENDAR",
	];

	return `${lines.map(foldLine).join("\r\n")}\r\n`;
}

/** Multi-session METHOD:PUBLISH feed; same UID/SEQUENCE/ORGANIZER rules as {@link buildIcsInvite}. */
export function buildIcsPublishCalendar(args: {
	events: readonly IcsPublishEventInput[];
	calendarName?: string;
	dtstampMs?: number;
}): string {
	const dtstamp = toIcsUtc(args.dtstampMs ?? Date.now());
	const lines = [
		"BEGIN:VCALENDAR",
		"PRODID:-//conference-engine//EN",
		"VERSION:2.0",
		"CALSCALE:GREGORIAN",
		"METHOD:PUBLISH",
		args.calendarName ? `X-WR-CALNAME:${escapeText(args.calendarName)}` : null,
		...args.events.flatMap((event) =>
			veventLines({
				...event,
				method: "PUBLISH",
				dtstamp,
			}),
		),
		"END:VCALENDAR",
	].filter((line): line is string => line !== null);

	return `${lines.map(foldLine).join("\r\n")}\r\n`;
}

export function stableAgendaUid(eventId: string, submissionId: string): string {
	return `agenda-${eventId}-${submissionId}@conference-engine.65labs.org`;
}
