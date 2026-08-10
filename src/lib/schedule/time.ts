export type WallParts = {
	year: number;
	month: number;
	day: number;
	hour: number;
	minute: number;
};

function pad2(value: number): string {
	return String(value).padStart(2, "0");
}

export function parseDayKey(value: string | null | undefined): string | null {
	if (!value) return null;
	if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
	return value;
}

export function formatInTimeZone(ms: number, timeZone: string): WallParts {
	const dtf = new Intl.DateTimeFormat("en-US", {
		timeZone,
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
		hour: "2-digit",
		minute: "2-digit",
		hourCycle: "h23",
	});
	const parts = dtf.formatToParts(new Date(ms));
	const map = new Map(parts.map((part) => [part.type, part.value]));
	return {
		year: Number(map.get("year")),
		month: Number(map.get("month")),
		day: Number(map.get("day")),
		hour: Number(map.get("hour")),
		minute: Number(map.get("minute")),
	};
}

export function dayKeyInTimeZone(ms: number, timeZone: string): string {
	const parts = formatInTimeZone(ms, timeZone);
	return `${parts.year}-${pad2(parts.month)}-${pad2(parts.day)}`;
}

export function wallTimeToUtcMs(
	dayKey: string,
	minutesFromMidnight: number,
	timeZone: string,
): number {
	const [year, month, day] = dayKey.split("-").map(Number) as [number, number, number];
	const hour = Math.floor(minutesFromMidnight / 60);
	const minute = minutesFromMidnight % 60;
	let utc = Date.UTC(year, month - 1, day, hour, minute, 0);

	for (let i = 0; i < 4; i++) {
		const parts = formatInTimeZone(utc, timeZone);
		const want = Date.UTC(year, month - 1, day, hour, minute, 0);
		const got = Date.UTC(
			parts.year,
			parts.month - 1,
			parts.day,
			parts.hour,
			parts.minute,
			0,
		);
		utc += want - got;
	}

	return utc;
}

export function formatClock(ms: number, timeZone: string): string {
	const parts = formatInTimeZone(ms, timeZone);
	return `${pad2(parts.hour)}:${pad2(parts.minute)}`;
}

export function formatDayLabel(dayKey: string, timeZone: string): string {
	const ms = wallTimeToUtcMs(dayKey, 12 * 60, timeZone);
	return new Intl.DateTimeFormat("en-US", {
		timeZone,
		weekday: "short",
		month: "short",
		day: "numeric",
		year: "numeric",
	}).format(new Date(ms));
}

/** Compact chip label for day pickers ("Sat 10"). */
export function formatDayChip(dayKey: string, timeZone: string): string {
	const ms = wallTimeToUtcMs(dayKey, 12 * 60, timeZone);
	return new Intl.DateTimeFormat("en-US", {
		timeZone,
		weekday: "short",
		day: "numeric",
	}).format(new Date(ms));
}

export const DAY_START_MINUTES = 9 * 60;
export const DAY_END_MINUTES = 18 * 60;
export const SLOT_STEP_MINUTES = 30;

/** Monday–Sunday calendar week containing `dayKey` (YYYY-MM-DD as a civil date). */
export function weekDayKeys(dayKey: string): string[] {
	const [year, month, day] = dayKey.split("-").map(Number) as [
		number,
		number,
		number,
	];
	const utc = Date.UTC(year, month - 1, day);
	const dow = new Date(utc).getUTCDay(); // 0 = Sun
	const mondayOffset = dow === 0 ? -6 : 1 - dow;
	const mondayMs = utc + mondayOffset * 24 * 60 * 60 * 1000;
	const keys: string[] = [];
	for (let i = 0; i < 7; i++) {
		const d = new Date(mondayMs + i * 24 * 60 * 60 * 1000);
		keys.push(
			`${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`,
		);
	}
	return keys;
}

/**
 * Prefer explicit civil event dates, then scheduled content, and only then the
 * current day in the event timezone. This keeps a new event usable without
 * leaking the old demo date into production.
 */
export function deriveScheduleDays(args: {
	startDay?: string | null;
	endDay?: string | null;
	scheduledDays?: readonly string[];
	timeZone: string;
	now?: number;
}): string[] {
	const start = parseDayKey(args.startDay);
	const end = parseDayKey(args.endDay);
	if (start && end && start <= end) {
		const days: string[] = [];
		for (let current = start; current <= end; ) {
			days.push(current);
			const [year, month, day] = current.split("-").map(Number) as [number, number, number];
			const next = new Date(Date.UTC(year, month - 1, day + 1));
			current = `${next.getUTCFullYear()}-${pad2(next.getUTCMonth() + 1)}-${pad2(next.getUTCDate())}`;
		}
		return days;
	}
	const scheduled = [...new Set((args.scheduledDays ?? []).map(parseDayKey).filter((day): day is string => Boolean(day)))].sort();
	if (scheduled.length > 0) return scheduled;
	return [dayKeyInTimeZone(args.now ?? Date.now(), args.timeZone)];
}

/** Default day tab when no `?day=` param: today if it has sessions, else next session day, else first event day. */
export function defaultScheduleDayKey(
	days: readonly string[],
	scheduledDayKeys: ReadonlySet<string>,
	todayKey: string,
): string {
	if (days.length === 0) {
		return todayKey;
	}
	if (scheduledDayKeys.has(todayKey)) {
		return todayKey;
	}
	const upcomingWithSessions = days.find(
		(day) => day >= todayKey && scheduledDayKeys.has(day),
	);
	if (upcomingWithSessions !== undefined) {
		return upcomingWithSessions;
	}
	return days[0]!;
}
