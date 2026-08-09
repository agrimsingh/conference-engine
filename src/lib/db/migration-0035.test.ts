import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("0035 Accelevents one-way sync migration", () => {
	it("stores encrypted per-event credentials and idempotent external mappings", () => {
		const sql = readFileSync(
			join(process.cwd(), "migrations/0035_accelevents_sync.sql"),
			"utf8",
		);
		expect(sql).toMatch(/CREATE TABLE accelevents_integrations/);
		expect(sql).toMatch(/encrypted_api_key/);
		expect(sql).toMatch(/external_event_id INTEGER NOT NULL/);
		expect(sql).toMatch(/CREATE TABLE accelevents_sync_mappings/);
		expect(sql).toMatch(/sync_state TEXT NOT NULL DEFAULT 'synced'/);
		expect(sql).toMatch(/UNIQUE \(event_id, local_kind, local_id\)/);
		expect(sql).not.toMatch(/DROP TABLE|DELETE FROM/i);
	});
});
