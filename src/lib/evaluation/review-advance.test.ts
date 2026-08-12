import { describe, expect, it } from "vitest";
import { nextUnscoredVisibleIndex } from "./review-advance";

function row(
	id: string,
	overrides: { recusedAt?: number | null; authoredScoreCount?: number } = {},
) {
	return {
		id,
		recusedAt: overrides.recusedAt ?? null,
		authoredScoreCount: overrides.authoredScoreCount ?? 0,
	};
}

describe("nextUnscoredVisibleIndex", () => {
	it("advances to the next unscored assignment after the current row", () => {
		expect(
			nextUnscoredVisibleIndex(
				[row("a", { authoredScoreCount: 3 }), row("b"), row("c")],
				0,
				3,
			),
		).toBe(1);
	});

	it("skips recused and already fully scored rows", () => {
		expect(
			nextUnscoredVisibleIndex(
				[
					row("a", { authoredScoreCount: 3 }),
					row("b", { recusedAt: 1 }),
					row("c", { authoredScoreCount: 3 }),
					row("d"),
				],
				0,
				3,
			),
		).toBe(3);
	});

	it("stays when nothing later is unscored", () => {
		expect(
			nextUnscoredVisibleIndex(
				[row("a"), row("b", { authoredScoreCount: 2 }), row("c", { recusedAt: 9 })],
				0,
				2,
			),
		).toBeNull();
	});
});
