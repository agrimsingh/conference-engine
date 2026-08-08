type EventScheduleBounds = {
	timezone: string;
	start_day: string | null;
	end_day: string | null;
};

function dayInTimezone(timestampMs: number, timezone: string): string | null {
	try {
		const parts = new Intl.DateTimeFormat("en-US", {
			timeZone: timezone,
			year: "numeric",
			month: "2-digit",
			day: "2-digit",
		}).formatToParts(new Date(timestampMs));
		const value = (part: Intl.DateTimeFormatPartTypes) => parts.find((partValue) => partValue.type === part)?.value;
		const year = value("year");
		const month = value("month");
		const day = value("day");
		return year && month && day ? `${year}-${month}-${day}` : null;
	} catch {
		return null;
	}
}

/** Both endpoints must lie within the event's configured civil-day range. */
export function validateEventScheduleBounds(
	event: EventScheduleBounds,
	startsAtMs: number,
	endsAtMs: number,
): string | null {
	if (!event.start_day && !event.end_day) return null;
	const startDay = dayInTimezone(startsAtMs, event.timezone);
	const endDay = dayInTimezone(endsAtMs - 1, event.timezone);
	if (!startDay || !endDay) return "Event timezone is invalid";
	if (event.start_day && startDay < event.start_day) return "Schedule placement starts before this event";
	if (event.end_day && endDay > event.end_day) return "Schedule placement ends after this event";
	return null;
}
