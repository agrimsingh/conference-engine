import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("0030 content deliverables", () => {
	it("adds immutable versions, comments, revisions and an approval backfill", () => {
		const sql = readFileSync(join(process.cwd(), "migrations/0030_content_deliverables.sql"), "utf8");
		expect(sql).toMatch(/CREATE TABLE deliverable_versions/);
		expect(sql).toMatch(/UNIQUE \(task_id, version_number\)/);
		expect(sql).toMatch(/INSERT OR IGNORE INTO deliverable_versions/);
		expect(sql).toMatch(/CREATE TABLE deliverable_comments/);
		expect(sql).toMatch(/CREATE TABLE content_revisions/);
		expect(sql).toMatch(/content_status.*DEFAULT 'draft'/s);
		expect(sql).toMatch(/WHERE status = 'published'/);
		expect(sql).not.toMatch(/DROP TABLE|DELETE FROM/i);
	});
});
