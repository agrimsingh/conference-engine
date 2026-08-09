import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("scheduled speaker reminders", () => {
	it("keeps the daily Worker cron wired to due-only task reminders and draft reminders", () => {
		const source = readFileSync(join(process.cwd(), "worker.ts"), "utf8");
		expect(source).toMatch(/async scheduled\(event, env, ctx\)/);
		expect(source).toMatch(/const now = Date\.now\(\)/);
		expect(source).toMatch(/sendTaskReminders\(env, \{ now, dueMode: "due_or_overdue" \}\)/);
		expect(source).toMatch(/sendDraftReminders\(env, \{ now \}\)/);
		expect(source).toMatch(/syncOptInEventsToAccelevents\(env\)/);
		expect(source).toMatch(/ctx\.waitUntil/);
	});
});
