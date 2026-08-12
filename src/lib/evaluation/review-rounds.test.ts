import { describe, expect, it } from "vitest";
import type { EvaluationCriterionRow } from "@/lib/db/types";
import { reviewerIdentityFields } from "./blind";
import { reviewRoundAvailability, validateCriterionScores, weightedAggregateScore } from "./score";

function criterion(overrides: Partial<EvaluationCriterionRow> & Pick<EvaluationCriterionRow, "id" | "label">): EvaluationCriterionRow {
	return {
		plan_id: "round-1", description: null,
		weight: 1, scale_min: 1, scale_max: 5, criterion_type: "numeric", options_json: null,
		position: 0, soft_deleted: 0, created_at: 0, updated_at: 0, ...overrides,
	};
}

describe("review rounds", () => {
	it("rejects scoring before open, after close, and for closed rounds", () => {
		expect(reviewRoundAvailability({ status: "active", open_at: 200, close_at: 300 }, 199)).toMatchObject({ ok: false, status: 409 });
		expect(reviewRoundAvailability({ status: "active", open_at: 200, close_at: 300 }, 301)).toMatchObject({ ok: false, status: 409 });
		expect(reviewRoundAvailability({ status: "closed", open_at: null, close_at: null }, 250)).toMatchObject({ ok: false, status: 409 });
		expect(reviewRoundAvailability({ status: "active", open_at: 200, close_at: 300 }, 250)).toEqual({ ok: true });
	});

	it("keeps exact weighted aggregates instead of rounding", () => {
		const criteria = [criterion({ id: "originality", label: "Originality", weight: 2 }), criterion({ id: "relevance", label: "Relevance", weight: 1 })];
		expect(weightedAggregateScore(criteria, [{ criterionId: "originality", value: 4 }, { criterionId: "relevance", value: 2 }])).toBe(10 / 3);
	});

	it("validates dropdown options and stores all scorecard value types", () => {
		const criteria = [
			criterion({ id: "score", label: "Score" }),
			criterion({ id: "recommendation", label: "Recommendation", criterion_type: "dropdown", scale_min: 0, scale_max: 1, options_json: JSON.stringify(["Accept", "Maybe", "Reject"]) }),
			criterion({ id: "comments", label: "Comments", criterion_type: "text", scale_min: 0, scale_max: 1 }),
		];
		expect(validateCriterionScores(criteria, [{ criterionId: "score", value: 4 }, { criterionId: "recommendation", value: "Accept" }, { criterionId: "comments", value: "Specific feedback" }])).toMatchObject({ numericRows: [{ value: 4 }] });
		expect(validateCriterionScores(criteria, [{ criterionId: "score", value: 4 }, { criterionId: "recommendation", value: "Strong accept" }, { criterionId: "comments", value: "Specific feedback" }])).toMatchObject({ ok: false, status: 400 });
	});

	it("always strips submitter email from reviewer payloads", () => {
		const row = { submitterName: "Priya Raman", submitterEmail: "priya@example.com", answers: { title: "Taming CI", abstract: "Builds", company: "Latticework Systems", coAuthorName: "Marcus Okafor" } };
		expect(reviewerIdentityFields(row, false)).toEqual({
			submitterName: "Priya Raman",
			submitterEmail: null,
			answers: { title: "Taming CI", abstract: "Builds", company: "Latticework Systems", coAuthorName: "Marcus Okafor" },
		});
	});

	it("strips submitter name and identity-bearing answers when blind", () => {
		const row = { submitterName: "Priya Raman", submitterEmail: "priya@example.com", answers: { title: "Taming CI", abstract: "Builds", company: "Latticework Systems", coAuthorName: "Marcus Okafor" } };
		expect(reviewerIdentityFields(row, true)).toEqual({ submitterName: null, submitterEmail: null, answers: { title: "Taming CI", abstract: "Builds" } });
	});

});
