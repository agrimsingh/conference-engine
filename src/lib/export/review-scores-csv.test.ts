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
				average: "4.5",
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
					average: "3",
					scores_by_reviewer: { r1: "3", r2: "" },
				},
			],
		});

		expect(csv).toBe(
			["submission_id,title,status,average,Ada,Grace", "s1,'=cmd(),submitted,3,3,", ""].join("\n"),
		);
	});

	it("exports typed criterion values with the exact aggregate and status", () => {
		const rows = buildReviewScoreExportRows({
			submissions: [{ id: "s1", status: "under_review", answers_json: JSON.stringify({ title: "Taming CI" }) }],
			reviewers: [{ id: "sam", name: "Sam" }],
			aggregates: [{ submission_id: "s1", reviewer_id: "sam", score: 10 / 3 }],
			criteria: [{ id: "originality", type: "numeric" }, { id: "recommendation", type: "dropdown" }, { id: "comments", type: "text" }],
			criterionScores: [
				{ submission_id: "s1", reviewer_id: "sam", criterion_id: "originality", score: 4, value_text: null },
				{ submission_id: "s1", reviewer_id: "sam", criterion_id: "recommendation", score: 0, value_text: "Accept" },
				{ submission_id: "s1", reviewer_id: "sam", criterion_id: "comments", score: 0, value_text: "Specific feedback" },
			],
		});
		const csv = reviewScoresToCsv({
			eventSlug: "event", planId: "round", planName: "Initial Review",
			reviewerNames: [{ id: "sam", name: "Sam" }],
			criteria: [{ id: "originality", label: "Originality" }, { id: "recommendation", label: "Recommendation" }, { id: "comments", label: "Comments" }],
			rows,
		});
		expect(csv).toContain("Sam · Recommendation");
		expect(csv).toContain("under_review,3.3333333333333335,3.3333333333333335,4,Accept,Specific feedback");
	});
});
