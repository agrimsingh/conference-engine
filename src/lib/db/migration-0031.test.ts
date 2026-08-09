import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("0031 review rounds migration", () => {
	it("adds dated blind rounds, caps, and typed criterion values", () => {
		const sql = readFileSync(join(process.cwd(), "migrations/0031_review_rounds.sql"), "utf8");
		for (const fragment of ["open_at", "close_at", "blind_review", "assignment_cap", "criterion_type", "options_json", "value_text"]) expect(sql).toContain(fragment);
	});
});
