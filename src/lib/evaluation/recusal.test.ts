import { describe, expect, it } from "vitest";
import { isActiveAssignment } from "./recusal";

describe("recusal semantics", () => {
	it("treats null recused_at as active required work", () => {
		expect(isActiveAssignment({ recused_at: null })).toBe(true);
	});

	it("excludes recused assignments from required completion", () => {
		expect(isActiveAssignment({ recused_at: 1 })).toBe(false);
	});

	it("models undecided eligibility like cockpit SQL (active must all be scored)", () => {
		const assignments = [
			{ reviewer_id: "a", recused_at: null, scored: true },
			{ reviewer_id: "b", recused_at: 10, scored: false },
			{ reviewer_id: "c", recused_at: null, scored: true },
		];
		const active = assignments.filter((row) => isActiveAssignment(row));
		const incomplete = active.filter((row) => !row.scored);
		const readyForUndecided = active.length > 0 && incomplete.length === 0;
		expect(incomplete).toEqual([]);
		expect(readyForUndecided).toBe(true);
	});

	it("keeps partially scored active assignments out of undecided", () => {
		const assignments = [
			{ reviewer_id: "a", recused_at: null, scored: true },
			{ reviewer_id: "b", recused_at: null, scored: false },
			{ reviewer_id: "c", recused_at: 10, scored: false },
		];
		const active = assignments.filter((row) => isActiveAssignment(row));
		const incomplete = active.filter((row) => !row.scored);
		expect(incomplete.map((row) => row.reviewer_id)).toEqual(["b"]);
		expect(active.length > 0 && incomplete.length === 0).toBe(false);
	});
});
