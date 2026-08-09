import { describe, expect, it } from "vitest";
import { sortScoreMatrixRows } from "./score-matrix-sort";

const rows = [
	{ id: "a", title: "Zebra talk", status: "submitted", average: 3 },
	{ id: "b", title: "Alpha talk", status: "accepted", average: 4.5 },
	{ id: "c", title: "Middle talk", status: "under_review", average: null },
];

describe("sortScoreMatrixRows", () => {
	it("sorts by aggregate average with nulls last", () => {
		expect(sortScoreMatrixRows(rows, "avg", "desc").map((row) => row.id)).toEqual(["b", "a", "c"]);
		expect(sortScoreMatrixRows(rows, "avg", "asc").map((row) => row.id)).toEqual(["a", "b", "c"]);
	});

	it("sorts by title", () => {
		expect(sortScoreMatrixRows(rows, "title", "asc").map((row) => row.title)).toEqual([
			"Alpha talk",
			"Middle talk",
			"Zebra talk",
		]);
	});

	it("sorts by status", () => {
		expect(sortScoreMatrixRows(rows, "status", "asc").map((row) => row.status)).toEqual([
			"accepted",
			"submitted",
			"under_review",
		]);
	});
});
