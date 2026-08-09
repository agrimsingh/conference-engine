import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("0029 public embeds", () => {
	it("adds event-scoped immutable-safe embed definitions", () => {
		const sql = readFileSync(join(process.cwd(), "migrations/0029_public_embeds.sql"), "utf8");
		expect(sql).toMatch(/CREATE TABLE public_embeds/);
		expect(sql).toMatch(/event_id TEXT NOT NULL REFERENCES events/);
		expect(sql).toMatch(/UNIQUE\s*\(event_id, slug\)/);
		expect(sql).toMatch(/widget_type.*agenda/s);
		expect(sql).not.toMatch(/DROP TABLE|DELETE FROM/i);
	});
});
