import { describe, expect, it } from "vitest";
import {
	buildSubmissionPacingChart,
	buildSubmissionPacingPoints,
	civilDayDelta,
} from "./submission-pacing";

describe("civilDayDelta", () => {
	it("counts whole days between civil keys", () => {
		expect(civilDayDelta("2026-10-01", "2026-10-10")).toBe(9);
		expect(civilDayDelta("2026-10-10", "2026-10-10")).toBe(0);
		expect(civilDayDelta("2026-10-12", "2026-10-10")).toBe(-2);
	});
});

describe("buildSubmissionPacingPoints", () => {
	it("accumulates daily counts aligned to days until event start", () => {
		const result = buildSubmissionPacingPoints({
			submissionDays: [
				"2026-09-01",
				"2026-09-01",
				"2026-09-03",
				"2026-09-05",
			],
			eventStartDay: "2026-10-10",
			originDay: "2026-09-01",
			asOfDay: "2026-09-05",
		});

		expect(result.xAxis).toBe("days_until_start");
		expect(result.total).toBe(4);
		expect(result.points).toEqual([
			{ x: civilDayDelta("2026-09-01", "2026-10-10"), cumulative: 2 },
			{ x: civilDayDelta("2026-09-02", "2026-10-10"), cumulative: 2 },
			{ x: civilDayDelta("2026-09-03", "2026-10-10"), cumulative: 3 },
			{ x: civilDayDelta("2026-09-04", "2026-10-10"), cumulative: 3 },
			{ x: civilDayDelta("2026-09-05", "2026-10-10"), cumulative: 4 },
		]);
	});

	it("uses day index when event start is unset", () => {
		const result = buildSubmissionPacingPoints({
			submissionDays: ["2026-01-02", "2026-01-04"],
			eventStartDay: null,
			originDay: null,
			asOfDay: "2026-01-04",
		});

		expect(result.xAxis).toBe("day_index");
		expect(result.originDay).toBe("2026-01-02");
		expect(result.points).toEqual([
			{ x: 0, cumulative: 1 },
			{ x: 1, cumulative: 1 },
			{ x: 2, cumulative: 2 },
		]);
	});

	it("prefers the earlier of form open and first submission as origin", () => {
		const result = buildSubmissionPacingPoints({
			submissionDays: ["2026-09-05"],
			eventStartDay: "2026-10-10",
			originDay: "2026-09-10",
			asOfDay: "2026-09-10",
		});

		expect(result.originDay).toBe("2026-09-05");
		expect(result.points[0]).toEqual({
			x: civilDayDelta("2026-09-05", "2026-10-10"),
			cumulative: 1,
		});
	});

	it("returns an empty series when there is no origin", () => {
		const result = buildSubmissionPacingPoints({
			submissionDays: [],
			eventStartDay: "2026-10-10",
			originDay: null,
			asOfDay: "2026-09-01",
		});

		expect(result.points).toEqual([]);
		expect(result.total).toBe(0);
	});
});

describe("buildSubmissionPacingChart", () => {
	it("leaves prior null when no baseline is provided", () => {
		const chart = buildSubmissionPacingChart({
			submissionDays: ["2026-09-01"],
			eventStartDay: "2026-10-10",
			originDay: "2026-09-01",
			asOfDay: "2026-09-01",
			prior: null,
		});

		expect(chart.prior).toBeNull();
		expect(chart.points).toHaveLength(1);
	});

	it("includes a prior series when a baseline is supplied", () => {
		const chart = buildSubmissionPacingChart({
			submissionDays: ["2026-09-01", "2026-09-02"],
			eventStartDay: "2026-10-10",
			originDay: "2026-09-01",
			asOfDay: "2026-09-02",
			prior: {
				submissionDays: ["2025-09-01", "2025-09-01", "2025-09-02"],
				eventStartDay: "2025-10-10",
				originDay: "2025-09-01",
				asOfDay: "2025-09-02",
			},
		});

		expect(chart.prior).toEqual([
			{ x: civilDayDelta("2025-09-01", "2025-10-10"), cumulative: 2 },
			{ x: civilDayDelta("2025-09-02", "2025-10-10"), cumulative: 3 },
		]);
	});
});
