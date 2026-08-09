import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("0036 speaker CRM", () => {
	it("adds event-scoped owner, tags, and append-only contact activity without changing delivery or task records", () => {
		// Given: the migration that adds the organizer-only CRM overlay.
		const sql = readFileSync(join(process.cwd(), "migrations/0036_speaker_crm.sql"), "utf8");

		// When: its schema contract is inspected.

		// Then: it has isolated CRM tables and keeps the existing operational sources intact.
		expect(sql).toMatch(/CREATE TABLE speaker_crm_profiles/);
		expect(sql).toMatch(/CREATE TABLE speaker_crm_tags/);
		expect(sql).toMatch(/CREATE TABLE speaker_crm_activities/);
		expect(sql).toMatch(/kind IN \('note', 'contact'\)/);
		expect(sql).toMatch(/PRIMARY KEY \(event_id, person_id\)/);
		expect(sql).not.toMatch(/ALTER TABLE (email_deliveries|speaker_tasks)/i);
		expect(sql).not.toMatch(/DROP TABLE|DELETE FROM/i);
	});
});
