export type ScoreMatrixCriterion = {
	id: string;
	label: string;
	weight: number;
	type: "numeric" | "dropdown" | "text";
};
export type ScoreMatrixReviewer = { id: string; name: string };
export type ScoreMatrixSubmission = { id: string; title: string };
export type ScoreMatrixAggregate = {
	submissionId: string;
	reviewerId: string | null;
	scoredBy: string;
	score: number;
	comment: string | null;
};
export type ScoreMatrixCriterionScore = {
	submissionId: string;
	reviewerId: string | null;
	criterionId: string;
	score: number;
	valueText: string | null;
	comment: string | null;
};

export type ScoreMatrixCriterionResult = {
	value: number | string | null;
	comment: string | null;
};

export type ScoreMatrixCell = {
	aggregate: number | null;
	comment: string | null;
	byCriterion: Record<string, ScoreMatrixCriterionResult>;
};

export type ScoreMatrix = {
	submissions: ScoreMatrixSubmission[];
	reviewers: ScoreMatrixReviewer[];
	criteria: ScoreMatrixCriterion[];
	cells: Record<string, Record<string, ScoreMatrixCell>>;
	averages: Record<string, number | null>;
};

/** Pivots plan score rows into submission × reviewer cells for the admin matrix. */
export function buildScoreComparisonMatrix(args: {
	submissions: ScoreMatrixSubmission[];
	reviewers: ScoreMatrixReviewer[];
	criteria: ScoreMatrixCriterion[];
	aggregates: ScoreMatrixAggregate[];
	criterionScores: ScoreMatrixCriterionScore[];
}): ScoreMatrix {
	const cells: ScoreMatrix["cells"] = {};
	const averages: ScoreMatrix["averages"] = {};
	for (const submission of args.submissions) {
		cells[submission.id] = {};
		for (const reviewer of args.reviewers) {
			cells[submission.id]![reviewer.id] = {
				aggregate: null,
				comment: null,
				byCriterion: Object.fromEntries(args.criteria.map((criterion) => [criterion.id, { value: null, comment: null }])),
			};
		}
	}
	for (const aggregate of args.aggregates) {
		if (!aggregate.reviewerId) continue;
		const cell = cells[aggregate.submissionId]?.[aggregate.reviewerId];
		if (cell) {
			cell.aggregate = aggregate.score;
			cell.comment = aggregate.comment;
		}
	}
	for (const score of args.criterionScores) {
		if (!score.reviewerId) continue;
		const cell = cells[score.submissionId]?.[score.reviewerId];
		const criterion = args.criteria.find((item) => item.id === score.criterionId);
		if (cell && criterion) {
			cell.byCriterion[score.criterionId] = {
				value: criterion.type === "numeric" ? score.score : score.valueText,
				comment: score.comment,
			};
		}
	}
	for (const submission of args.submissions) {
		const values = args.reviewers
			.map((reviewer) => cells[submission.id]?.[reviewer.id]?.aggregate)
			.filter((value): value is number => typeof value === "number");
		averages[submission.id] = values.length
			? values.reduce((sum, value) => sum + value, 0) / values.length
			: null;
	}
	return {
		submissions: args.submissions,
		reviewers: args.reviewers,
		criteria: args.criteria,
		cells,
		averages,
	};
}
