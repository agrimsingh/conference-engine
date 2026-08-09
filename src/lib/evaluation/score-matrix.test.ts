import { describe, expect, it } from "vitest";
import { buildScoreComparisonMatrix } from "./score-matrix";

describe("buildScoreComparisonMatrix", () => {
	it("pivots aggregates and criterion scores by submission and reviewer", () => {
		const matrix = buildScoreComparisonMatrix({
			submissions: [
				{ id: "s1", title: "Talk A" },
				{ id: "s2", title: "Talk B" },
			],
			reviewers: [
				{ id: "r1", name: "Ada" },
				{ id: "r2", name: "Grace" },
			],
			criteria: [
				{ id: "c1", label: "Clarity", weight: 1, type: "numeric" },
				{ id: "c2", label: "Recommendation", weight: 2, type: "dropdown" },
				{ id: "c3", label: "Private notes", weight: 0, type: "text" },
			],
			aggregates: [
				{ submissionId: "s1", reviewerId: "r1", scoredBy: "Ada", score: 4, comment: "Strong proposal" },
				{ submissionId: "s1", reviewerId: "r2", scoredBy: "Grace", score: 5, comment: null },
				{ submissionId: "s2", reviewerId: null, scoredBy: "committee", score: 3, comment: "Committee only" },
			],
			criterionScores: [
				{ submissionId: "s1", reviewerId: "r1", criterionId: "c1", score: 4, valueText: null, comment: "Clear examples" },
				{ submissionId: "s1", reviewerId: "r1", criterionId: "c2", score: 0, valueText: "Accept", comment: null },
				{ submissionId: "s1", reviewerId: "r1", criterionId: "c3", score: 0, valueText: "Pair with the testing talk", comment: "Programming note" },
				{ submissionId: "s1", reviewerId: "r2", criterionId: "c1", score: 5, valueText: null, comment: null },
			],
		});

		expect(matrix.cells.s1?.r1).toEqual({
			aggregate: 4,
			comment: "Strong proposal",
			byCriterion: {
				c1: { value: 4, comment: "Clear examples" },
				c2: { value: "Accept", comment: null },
				c3: { value: "Pair with the testing talk", comment: "Programming note" },
			},
		});
		expect(matrix.cells.s1?.r2?.aggregate).toBe(5);
		expect(matrix.cells.s1?.r2?.byCriterion.c2?.value).toBeNull();
		expect(matrix.cells.s2?.r1?.aggregate).toBeNull();
		expect(matrix.averages.s1).toBe(4.5);
		expect(matrix.averages.s2).toBeNull();
	});
});
