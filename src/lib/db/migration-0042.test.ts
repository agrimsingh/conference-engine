import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("0042 account contacts", () => {
	it("adds account-scoped CRM tables above the event speaker overlay", () => {
		const sql = readFileSync(join(process.cwd(), "migrations/0042_account_contacts.sql"), "utf8");

		expect(sql).toMatch(/CREATE TABLE account_contacts/);
		expect(sql).toMatch(/CREATE TABLE account_contact_tags/);
		expect(sql).toMatch(/CREATE TABLE account_contact_activities/);
		expect(sql).toMatch(/CREATE TABLE account_contact_pipeline/);
		expect(sql).toMatch(/CREATE TABLE account_contact_stage_history/);
		expect(sql).toMatch(/CREATE TABLE account_contact_segments/);
		expect(sql).toMatch(/CREATE TABLE event_speaker_contacts/);
		expect(sql).toMatch(/email COLLATE NOCASE/);
		expect(sql).toMatch(/research.*outreach.*negotiating.*confirmed.*declined/s);
		expect(sql).not.toMatch(/ALTER TABLE speaker_crm_/i);
		expect(sql).not.toMatch(/DROP TABLE|DELETE FROM/i);
	});
});
