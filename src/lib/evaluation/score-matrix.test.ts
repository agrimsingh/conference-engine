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
				{ id: "c1", label: "Clarity", weight: 1 },
				{ id: "c2", label: "Depth", weight: 2 },
			],
			aggregates: [
				{ submissionId: "s1", reviewerId: "r1", scoredBy: "Ada", score: 4 },
				{ submissionId: "s1", reviewerId: "r2", scoredBy: "Grace", score: 5 },
				{ submissionId: "s2", reviewerId: null, scoredBy: "committee", score: 3 },
			],
			criterionScores: [
				{ submissionId: "s1", reviewerId: "r1", criterionId: "c1", score: 4 },
				{ submissionId: "s1", reviewerId: "r1", criterionId: "c2", score: 5 },
				{ submissionId: "s1", reviewerId: "r2", criterionId: "c1", score: 5 },
			],
		});

		expect(matrix.cells.s1?.r1).toEqual({
			aggregate: 4,
			byCriterion: { c1: 4, c2: 5 },
		});
		expect(matrix.cells.s1?.r2?.aggregate).toBe(5);
		expect(matrix.cells.s1?.r2?.byCriterion.c2).toBeNull();
		expect(matrix.cells.s2?.r1?.aggregate).toBeNull();
		expect(matrix.averages.s1).toBe(4.5);
		expect(matrix.averages.s2).toBeNull();
	});
});
