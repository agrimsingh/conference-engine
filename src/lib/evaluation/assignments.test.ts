import { describe, expect, it } from "vitest";
import { filterBoardSubmissions } from "./assignments";
import type { ReviewAssignmentRow } from "@/lib/db/types";

const submissions = [
	{ id: "sub-a", title: "A" },
	{ id: "sub-b", title: "B" },
	{ id: "sub-c", title: "C" },
];

function assignment(submissionId: string): ReviewAssignmentRow {
	return {
		id: `asgn-${submissionId}`,
		plan_id: "plan-1",
		reviewer_id: "rev-1",
		submission_id: submissionId,
		created_at: 0,
	};
}

describe("filterBoardSubmissions", () => {
	it("returns all submissions for committee mode", () => {
		expect(
			filterBoardSubmissions(submissions, {
				mode: "committee",
				assignments: [],
			}),
		).toEqual(submissions);
	});

	it("returns empty for reviewer with zero assignments (fail closed)", () => {
		expect(
			filterBoardSubmissions(submissions, {
				mode: "reviewer",
				assignments: [],
			}),
		).toEqual([]);
	});

	it("defaults emptyMeansAll to fail-closed for reviewers", () => {
		expect(
			filterBoardSubmissions(submissions, {
				mode: "reviewer",
				assignments: [],
				emptyMeansAll: false,
			}),
		).toEqual([]);
		expect(
			filterBoardSubmissions(submissions, {
				mode: "reviewer",
				assignments: [],
				emptyMeansAll: undefined,
			}),
		).toEqual([]);
	});

	// Flag still supported for explicit callers; board must not pass it.
	it("returns all for reviewer with zero assignments when emptyMeansAll", () => {
		expect(
			filterBoardSubmissions(submissions, {
				mode: "reviewer",
				assignments: [],
				emptyMeansAll: true,
			}),
		).toEqual(submissions);
	});

	it("filters to assigned submission ids for reviewer", () => {
		expect(
			filterBoardSubmissions(submissions, {
				mode: "reviewer",
				assignments: [assignment("sub-b"), assignment("sub-c")],
			}),
		).toEqual([
			{ id: "sub-b", title: "B" },
			{ id: "sub-c", title: "C" },
		]);
	});

	it("ignores assignments for ids not in the submission list", () => {
		expect(
			filterBoardSubmissions(submissions, {
				mode: "reviewer",
				assignments: [assignment("missing"), assignment("sub-a")],
			}),
		).toEqual([{ id: "sub-a", title: "A" }]);
	});
});
