import { describe, expect, it } from "vitest";
import { buildReviewScoreExportRows, reviewScoresToCsv } from "./review-scores-csv";

describe("review scores CSV", () => {
	it("builds export rows with average and per-reviewer scores", () => {
		const rows = buildReviewScoreExportRows({
			submissions: [
				{
					id: "s1",
					status: "under_review",
					answers_json: JSON.stringify({ title: "Deep learning" }),
				},
				{
					id: "s2",
					status: "submitted",
					answers_json: JSON.stringify({ title: "No scores yet" }),
				},
			],
			reviewers: [
				{ id: "r1", name: "Ada" },
				{ id: "r2", name: "Grace" },
			],
			aggregates: [
				{ submission_id: "s1", reviewer_id: "r1", score: 4 },
				{ submission_id: "s1", reviewer_id: "r2", score: 5 },
				{ submission_id: "s2", reviewer_id: null, score: 3 },
			],
		});

		expect(rows).toEqual([
			{
				submission_id: "s1",
				title: "Deep learning",
				status: "under_review",
				average: "4.50",
				scores_by_reviewer: { r1: "4", r2: "5" },
			},
			{
				submission_id: "s2",
				title: "No scores yet",
				status: "submitted",
				average: "",
				scores_by_reviewer: { r1: "", r2: "" },
			},
		]);
	});

	it("renders CSV headers and escapes formula-like titles", () => {
		const csv = reviewScoresToCsv({
			eventSlug: "demo",
			planId: "plan-1",
			planName: "Round 1",
			reviewerNames: [
				{ id: "r1", name: "Ada" },
				{ id: "r2", name: "Grace" },
			],
			rows: [
				{
					submission_id: "s1",
					title: "=cmd()",
					status: "submitted",
					average: "3.00",
					scores_by_reviewer: { r1: "3", r2: "" },
				},
			],
		});

		expect(csv).toBe(
			["submission_id,title,status,average,Ada,Grace", "s1,'=cmd(),submitted,3.00,3,", ""].join("\n"),
		);
	});
});
