import { describe, expect, it } from "vitest";
import { composeReminderText } from "./reminders";

describe("composeReminderText", () => {
	it("keeps the system task list and portal fallback when no form copy exists", () => {
		expect(composeReminderText("Tasks: Bio\nPortal: /portal", null, { eventName: "Event", submitterName: "Ada", title: "2 tasks", resumeUrl: "https://example.test/portal" })).toBe("Tasks: Bio\nPortal: /portal");
	});

	it("prefixes custom form copy without removing the task list and portal", () => {
		expect(composeReminderText("Tasks: Bio\nPortal: /portal", "Hi {{submitter_name}}, please finish {{title}}.", { eventName: "Event", submitterName: "Ada", title: "2 tasks", resumeUrl: "https://example.test/portal" })).toContain("Hi Ada, please finish 2 tasks.\n\nTasks: Bio\nPortal: /portal");
	});
});
