import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
	join(process.cwd(), "migrations/0025_speaker_profile_task_fields.sql"),
	"utf8",
);

describe("0025 speaker profile + task fields migration shape", () => {
	it("adds event-scoped profile fields for roster/public consumers", () => {
		expect(sql).toMatch(/ALTER TABLE speaker_profiles ADD COLUMN job_title TEXT/);
		expect(sql).toMatch(/ALTER TABLE speaker_profiles ADD COLUMN company TEXT/);
		expect(sql).toMatch(/ALTER TABLE speaker_profiles ADD COLUMN social_json TEXT/);
		expect(sql).toMatch(/social_json shape/);
		expect(sql).not.toMatch(/ALTER TABLE people ADD COLUMN/);
		expect(sql).not.toMatch(/CREATE TABLE event_speakers/);
		expect(sql).not.toMatch(/workflow_status/);
	});

	it("adds template + task instructions/due_at for accept materialization", () => {
		expect(sql).toMatch(/ALTER TABLE task_templates ADD COLUMN instructions TEXT/);
		expect(sql).toMatch(/ALTER TABLE task_templates ADD COLUMN due_at INTEGER/);
		expect(sql).toMatch(/ALTER TABLE speaker_tasks ADD COLUMN instructions TEXT/);
		expect(sql).toMatch(/ALTER TABLE speaker_tasks ADD COLUMN due_at INTEGER/);
		expect(sql).toMatch(/snapshotted onto/);
	});
});
