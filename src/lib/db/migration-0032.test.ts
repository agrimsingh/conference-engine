import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("0032 speaker operations", () => {
	it("adds event-scoped general tasks, assignments, and logistics without changing deliverables", () => {
		const sql = readFileSync(join(process.cwd(), "migrations/0032_speaker_operations.sql"), "utf8");
		expect(sql).toMatch(/ALTER TABLE speaker_profiles ADD COLUMN logistics_text/);
		expect(sql).toMatch(/CREATE TABLE speaker_action_tasks/);
		expect(sql).toMatch(/CREATE TABLE speaker_action_task_assignments/);
		expect(sql).toMatch(/UNIQUE \(task_id, person_id\)/);
		expect(sql).toMatch(/CREATE TRIGGER speaker_action_assignment_event_insert/);
		expect(sql).toMatch(/CREATE TRIGGER speaker_action_assignment_event_update/);
		expect(sql.match(/speaker action assignment event mismatch/g)).toHaveLength(2);
		expect(sql).not.toMatch(/DROP TABLE|DELETE FROM|ALTER TABLE speaker_tasks/i);
	});
});
