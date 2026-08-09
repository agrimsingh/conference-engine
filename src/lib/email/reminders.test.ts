import { describe, expect, it } from "vitest";
import { composeReminderText, dueAwarePendingFilter } from "./reminders";

describe("composeReminderText", () => {
	it("keeps the system task list and portal fallback when no form copy exists", () => {
		expect(composeReminderText("Tasks: Bio\nPortal: /portal", null, { eventName: "Event", submitterName: "Ada", title: "2 tasks", resumeUrl: "https://example.test/portal" })).toBe("Tasks: Bio\nPortal: /portal");
	});

	it("prefixes custom form copy without removing the task list and portal", () => {
		expect(composeReminderText("Tasks: Bio\nPortal: /portal", "Hi {{submitter_name}}, please finish {{title}}.", { eventName: "Event", submitterName: "Ada", title: "2 tasks", resumeUrl: "https://example.test/portal" })).toContain("Hi Ada, please finish 2 tasks.\n\nTasks: Bio\nPortal: /portal");
	});
});

describe("dueAwarePendingFilter", () => {
	const now = 1_700_000_000_000;

	it("applies due_at IS NOT NULL AND due_at <= now for automated due_or_overdue mode", () => {
		expect(dueAwarePendingFilter({ hasDueAtColumn: true, dueMode: "due_or_overdue", now })).toEqual({
			clause: " AND st.due_at IS NOT NULL AND st.due_at <= ?",
			binds: [now],
		});
	});

	it("skips the due filter for admin all_pending force sends", () => {
		expect(dueAwarePendingFilter({ hasDueAtColumn: true, dueMode: "all_pending", now })).toEqual({
			clause: "",
			binds: [],
		});
	});

	it("falls back to no due filter when the due_at column is missing", () => {
		expect(dueAwarePendingFilter({ hasDueAtColumn: false, dueMode: "due_or_overdue", now })).toEqual({
			clause: "",
			binds: [],
		});
	});
});
