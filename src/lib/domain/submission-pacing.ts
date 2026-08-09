/**
 * Cumulative submission pacing: one series of counts aligned to days
 * until event start (or day index when start_day is unset).
 */

export type SubmissionPacingPoint = {
	/** Days until event start, or day index from origin when xAxis is day_index. */
	x: number;
	cumulative: number;
};

export type SubmissionPacingXAxis = "days_until_start" | "day_index";

export type SubmissionPacingChart = {
	points: SubmissionPacingPoint[];
	/** Cheap prior-edition overlay when a baseline exists; otherwise null. */
	prior: SubmissionPacingPoint[] | null;
	xAxis: SubmissionPacingXAxis;
	originDay: string | null;
	eventStartDay: string | null;
	total: number;
};

const MS_PER_DAY = 86_400_000;

function utcDayMs(day: string): number {
	const [year, month, date] = day.split("-").map(Number) as [number, number, number];
	return Date.UTC(year, month - 1, date);
}

function formatUtcDay(ms: number): string {
	const d = new Date(ms);
	const month = String(d.getUTCMonth() + 1).padStart(2, "0");
	const date = String(d.getUTCDate()).padStart(2, "0");
	return `${d.getUTCFullYear()}-${month}-${date}`;
}

function addUtcDays(day: string, delta: number): string {
	return formatUtcDay(utcDayMs(day) + delta * MS_PER_DAY);
}

/** Whole civil days from `from` to `to` (to − from). */
export function civilDayDelta(from: string, to: string): number {
	return Math.round((utcDayMs(to) - utcDayMs(from)) / MS_PER_DAY);
}

function earliestDay(days: readonly string[]): string | null {
	let min: string | null = null;
	for (const day of days) {
		if (min === null || day < min) min = day;
	}
	return min;
}

function resolveOrigin(
	originDay: string | null,
	submissionDays: readonly string[],
): string | null {
	const firstSubmission = earliestDay(submissionDays);
	if (originDay && firstSubmission) {
		return originDay <= firstSubmission ? originDay : firstSubmission;
	}
	return originDay ?? firstSubmission;
}

/**
 * Build daily cumulative points from origin through asOfDay.
 * Pure: no I/O. Callers map timestamps → civil day keys at the boundary.
 */
export function buildSubmissionPacingPoints(args: {
	submissionDays: readonly string[];
	eventStartDay: string | null;
	originDay: string | null;
	asOfDay: string;
}): {
	points: SubmissionPacingPoint[];
	xAxis: SubmissionPacingXAxis;
	originDay: string | null;
	total: number;
} {
	const total = args.submissionDays.length;
	const origin = resolveOrigin(args.originDay, args.submissionDays);
	if (!origin || args.asOfDay < origin) {
		return {
			points: [],
			xAxis: args.eventStartDay ? "days_until_start" : "day_index",
			originDay: origin,
			total,
		};
	}

	const counts = new Map<string, number>();
	for (const day of args.submissionDays) {
		if (day < origin || day > args.asOfDay) continue;
		counts.set(day, (counts.get(day) ?? 0) + 1);
	}

	const xAxis: SubmissionPacingXAxis = args.eventStartDay
		? "days_until_start"
		: "day_index";
	const points: SubmissionPacingPoint[] = [];
	let cumulative = 0;
	for (
		let day = origin;
		day <= args.asOfDay;
		day = addUtcDays(day, 1)
	) {
		cumulative += counts.get(day) ?? 0;
		const x =
			xAxis === "days_until_start" && args.eventStartDay
				? civilDayDelta(day, args.eventStartDay)
				: civilDayDelta(origin, day);
		points.push({ x, cumulative });
	}

	return { points, xAxis, originDay: origin, total };
}

export function buildSubmissionPacingChart(args: {
	submissionDays: readonly string[];
	eventStartDay: string | null;
	originDay: string | null;
	asOfDay: string;
	prior?: {
		submissionDays: readonly string[];
		eventStartDay: string | null;
		originDay: string | null;
		asOfDay: string;
	} | null;
}): SubmissionPacingChart {
	const current = buildSubmissionPacingPoints(args);
	const prior = args.prior
		? buildSubmissionPacingPoints(args.prior).points
		: null;
	return {
		points: current.points,
		prior: prior && prior.length > 0 ? prior : null,
		xAxis: current.xAxis,
		originDay: current.originDay,
		eventStartDay: args.eventStartDay,
		total: current.total,
	};
}
