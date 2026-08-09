import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
	join(process.cwd(), "migrations/0028_speaker_profile_sync_backfill.sql"),
	"utf8",
);

describe("0028 speaker profile sync backfill", () => {
	it("backfills contact fields between speaker_profiles and event_speaker_profiles without dropping workflow columns", () => {
		expect(sql).toMatch(/INSERT INTO speaker_profiles/);
		expect(sql).toMatch(/FROM event_speaker_profiles esp/);
		expect(sql).toMatch(/UPDATE speaker_profiles/);
		expect(sql).toMatch(/UPDATE event_speaker_profiles/);
		expect(sql).toMatch(/COALESCE\(\s*speaker_profiles\.job_title/);
		expect(sql).toMatch(/COALESCE\(\s*event_speaker_profiles\.job_title/);
		expect(sql).toMatch(/source of truth/);
		expect(sql).toMatch(/workflow_status/);
		expect(sql).not.toMatch(/DROP TABLE/);
		expect(sql).not.toMatch(/ALTER TABLE speaker_profiles DROP/);
	});
});
