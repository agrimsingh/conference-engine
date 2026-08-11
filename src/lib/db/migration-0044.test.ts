import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("0044 service blocks", () => {
	it("adds typed item_kind and agenda_visibility on submissions", () => {
		const sql = readFileSync(join(process.cwd(), "migrations/0044_service_blocks.sql"), "utf8");
		expect(sql).toMatch(/ALTER TABLE submissions ADD COLUMN item_kind TEXT NOT NULL DEFAULT 'talk'/);
		expect(sql).toMatch(/CHECK \(item_kind IN \('talk', 'service'\)\)/);
		expect(sql).toMatch(/ALTER TABLE submissions ADD COLUMN agenda_visibility TEXT NOT NULL DEFAULT 'public'/);
		expect(sql).toMatch(/CHECK \(agenda_visibility IN \('public', 'private'\)\)/);
		expect(sql).toMatch(/CREATE INDEX submissions_by_event_item_kind ON submissions \(event_id, item_kind\)/);
		expect(sql).not.toMatch(/DROP TABLE|DELETE FROM/i);
	});
});
