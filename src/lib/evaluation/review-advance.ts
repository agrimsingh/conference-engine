export function nextUnscoredVisibleIndex(
	visible: readonly {
		id: string;
		recusedAt: number | null;
		authoredScoreCount: number;
	}[],
	fromIndex: number,
	criteriaCount: number,
): number | null {
	for (let index = fromIndex + 1; index < visible.length; index += 1) {
		const row = visible[index];
		if (!row) continue;
		if (row.recusedAt != null) continue;
		if (criteriaCount > 0 && row.authoredScoreCount === criteriaCount) continue;
		return index;
	}
	return null;
}
