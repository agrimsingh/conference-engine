import {
	buildSubmissionPacingChart,
	type SubmissionPacingChart,
} from "@/lib/domain/submission-pacing";
import type { EventRow } from "@/lib/db/types";
import { dayKeyInTimeZone } from "@/lib/schedule/time";

/**
 * Load cumulative submission pacing for the dashboard widget.
 * Prior edition stays null until an event has a cheap baseline series.
 */
export async function loadSubmissionPacingChart(
	db: D1Database,
	event: EventRow,
	now = Date.now(),
): Promise<SubmissionPacingChart> {
	const [created, opens] = await Promise.all([
		db
			.prepare("SELECT created_at FROM submissions WHERE event_id = ?")
			.bind(event.id)
			.all<{ created_at: number }>(),
		db
			.prepare(
				`SELECT MIN(opens_at) AS opens_at
         FROM cfp_forms
         WHERE event_id = ? AND opens_at IS NOT NULL`,
			)
			.bind(event.id)
			.first<{ opens_at: number | null }>(),
	]);

	const timezone = event.timezone;
	const submissionDays = (created.results ?? []).map((row) =>
		dayKeyInTimeZone(row.created_at, timezone),
	);
	const originDay =
		opens?.opens_at != null
			? dayKeyInTimeZone(opens.opens_at, timezone)
			: null;

	return buildSubmissionPacingChart({
		submissionDays,
		eventStartDay: event.start_day,
		originDay,
		asOfDay: dayKeyInTimeZone(now, timezone),
		prior: null,
	});
}
