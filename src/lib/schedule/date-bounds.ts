type EventScheduleBounds = {
	timezone: string;
	start_day: string | null;
	end_day: string | null;
	day_start_minutes?: number;
	day_end_minutes?: number;
	slot_duration_minutes?: number;
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
	if (!Number.isFinite(startsAtMs) || !Number.isFinite(endsAtMs)) return "Schedule timestamps are invalid";
	if (startsAtMs % 60_000 !== 0 || endsAtMs % 60_000 !== 0) return "Schedule placement must use whole-minute slot boundaries";
	const startDay = dayInTimezone(startsAtMs, event.timezone);
	const endDay = dayInTimezone(endsAtMs - 1, event.timezone);
	if (!startDay || !endDay) return "Event timezone is invalid";
	if (event.start_day && startDay < event.start_day) return "Schedule placement starts before this event";
	if (event.end_day && endDay > event.end_day) return "Schedule placement ends after this event";
	if (startDay !== endDay) return "Schedule placement must stay within one event day";
	const start = wallMinute(startsAtMs, event.timezone);
	const finalMinute = wallMinute(endsAtMs - 1, event.timezone);
	if (start === null || finalMinute === null) return "Event timezone is invalid";
	const end = finalMinute + 1;
	const dayStart = event.day_start_minutes ?? 9 * 60;
	const dayEnd = event.day_end_minutes ?? 18 * 60;
	const slotDuration = event.slot_duration_minutes ?? 30;
	if (start < dayStart || end > dayEnd) return "Schedule placement falls outside this event's daily schedule";
	if ((start - dayStart) % slotDuration !== 0) return "Schedule placement must start on a configured slot boundary";
	return null;
}

function wallMinute(timestampMs: number, timezone: string): number | null {
	try {
		const parts = new Intl.DateTimeFormat("en-US", { timeZone: timezone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(timestampMs));
		const value = (part: Intl.DateTimeFormatPartTypes) => Number(parts.find((item) => item.type === part)?.value);
		const hour = value("hour"); const minute = value("minute");
		return Number.isInteger(hour) && Number.isInteger(minute) ? hour * 60 + minute : null;
	} catch { return null; }
}
