import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("0034 portal resources", () => {
	it("adds event-scoped draftable resource pages without destructive migration steps", () => {
		const sql = readFileSync(join(process.cwd(), "migrations/0034_portal_resources.sql"), "utf8");

		expect(sql).toMatch(/CREATE TABLE portal_resources/);
		expect(sql).toMatch(/event_id TEXT NOT NULL REFERENCES events/);
		expect(sql).toMatch(/resource_type.*rich_text.*embed/s);
		expect(sql).toMatch(/published INTEGER NOT NULL DEFAULT 0/);
		expect(sql).toMatch(/UNIQUE \(event_id, slug\)/);
		expect(sql).not.toMatch(/DROP TABLE|DELETE FROM/i);
	});
});
