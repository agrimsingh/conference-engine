import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("migration 0039", () => {
	it("adds an opt-in automatic Accelevents sync flag", () => {
		const sql = readFileSync(
			join(process.cwd(), "migrations/0039_accelevents_auto_sync.sql"),
			"utf8",
		);

		expect(sql).toMatch(/ADD COLUMN auto_sync_enabled INTEGER NOT NULL DEFAULT 0/);
		expect(sql).toMatch(/CHECK \(auto_sync_enabled IN \(0, 1\)\)/);
	});
});
