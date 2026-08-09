export type ScoreMatrixSortKey = "avg" | "title" | "status";
export type ScoreMatrixSortDirection = "asc" | "desc";

export type ScoreMatrixSortableRow = {
	id: string;
	title: string;
	status: string;
	average: number | null;
};

/** Stable client sort for the admin score comparison table. */
export function sortScoreMatrixRows(
	rows: ScoreMatrixSortableRow[],
	key: ScoreMatrixSortKey,
	direction: ScoreMatrixSortDirection = "asc",
): ScoreMatrixSortableRow[] {
	const sign = direction === "desc" ? -1 : 1;
	return [...rows].sort((left, right) => {
		const ranked = compareScoreMatrixRows(left, right, key, sign);
		if (ranked !== 0) return ranked;
		return left.title.localeCompare(right.title) || left.id.localeCompare(right.id);
	});
}

function compareScoreMatrixRows(
	left: ScoreMatrixSortableRow,
	right: ScoreMatrixSortableRow,
	key: ScoreMatrixSortKey,
	sign: number,
): number {
	switch (key) {
		case "avg": {
			const leftAvg = left.average;
			const rightAvg = right.average;
			if (leftAvg === null && rightAvg === null) return 0;
			if (leftAvg === null) return 1;
			if (rightAvg === null) return -1;
			return (leftAvg - rightAvg) * sign;
		}
		case "title":
			return left.title.localeCompare(right.title) * sign;
		case "status":
			return left.status.localeCompare(right.status) * sign;
		default: {
			const _exhaustive: never = key;
			return _exhaustive;
		}
	}
}
