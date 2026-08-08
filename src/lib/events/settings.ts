const DAY = 86_400_000;
export const MAX_EVENT_DURATION_DAYS = 31;

function parseCivilDay(value: string): number | null {
	const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
	if (!match) return null;
	const year = Number(match[1]);
	const month = Number(match[2]);
	const day = Number(match[3]);
	const timestamp = Date.UTC(year, month - 1, day);
	const parsed = new Date(timestamp);
	return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day
		? timestamp
		: null;
}

export function isValidIanaTimeZone(timezone: string): boolean {
	try {
		new Intl.DateTimeFormat("en", { timeZone: timezone });
		return true;
	} catch {
		return false;
	}
}

export function validateEventSettings(args: { startDay: string; endDay: string; timezone?: string }): { ok: true } | { ok: false; error: string } {
	const start = parseCivilDay(args.startDay);
	const end = parseCivilDay(args.endDay);
	if (start === null || end === null) return { ok: false, error: "Start and end dates must be real calendar dates." };
	if (end < start) return { ok: false, error: "The end date must be on or after the start date." };
	if ((end - start) / DAY + 1 > MAX_EVENT_DURATION_DAYS) return { ok: false, error: `Events can span at most ${MAX_EVENT_DURATION_DAYS} days.` };
	if (args.timezone && !isValidIanaTimeZone(args.timezone)) return { ok: false, error: "Timezone must be a valid IANA timezone, such as Asia/Singapore." };
	return { ok: true };
}
