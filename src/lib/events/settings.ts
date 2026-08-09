const DAY = 86_400_000;
export const MAX_EVENT_DURATION_DAYS = 31;
export const MINUTES_PER_DAY = 24 * 60;
export const ALLOWED_SLOT_DURATIONS = [15, 20, 30, 45, 60, 90, 120] as const;

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

export function validateEventSettings(args: {
	startDay: string;
	endDay: string;
	timezone?: string;
	dayStartMinutes?: number;
	dayEndMinutes?: number;
	slotDurationMinutes?: number;
}): { ok: true } | { ok: false; error: string } {
	const start = parseCivilDay(args.startDay);
	const end = parseCivilDay(args.endDay);
	if (start === null || end === null) return { ok: false, error: "Start and end dates must be real calendar dates." };
	if (end < start) return { ok: false, error: "The end date must be on or after the start date." };
	if ((end - start) / DAY + 1 > MAX_EVENT_DURATION_DAYS) return { ok: false, error: `Events can span at most ${MAX_EVENT_DURATION_DAYS} days.` };
	if (args.timezone && !isValidIanaTimeZone(args.timezone)) return { ok: false, error: "Timezone must be a valid IANA timezone, such as Asia/Singapore." };
	const startMinutes = args.dayStartMinutes ?? 9 * 60;
	const endMinutes = args.dayEndMinutes ?? 18 * 60;
	const slotDuration = args.slotDurationMinutes ?? 30;
	if (!Number.isInteger(startMinutes) || startMinutes < 0 || startMinutes >= MINUTES_PER_DAY) return { ok: false, error: "Day start must be a whole minute from 00:00 through 23:59." };
	if (!Number.isInteger(endMinutes) || endMinutes <= 0 || endMinutes > MINUTES_PER_DAY || endMinutes <= startMinutes) return { ok: false, error: "Day end must be after day start and no later than 24:00." };
	if (!Number.isInteger(slotDuration) || !ALLOWED_SLOT_DURATIONS.includes(slotDuration as typeof ALLOWED_SLOT_DURATIONS[number])) return { ok: false, error: "Slot duration must be 15, 20, 30, 45, 60, 90, or 120 minutes." };
	return { ok: true };
}
