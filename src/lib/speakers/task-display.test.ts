import { describe, expect, it } from "vitest";
import { isTaskOverdue, taskDueLabel } from "./task-display";

describe("task due display", () => {
	const now = 1_700_000_000_000;

	it("marks pending tasks overdue only when due_at is before now", () => {
		expect(isTaskOverdue({ dueAt: now - 1, status: "pending", now })).toBe(true);
		expect(isTaskOverdue({ dueAt: now, status: "pending", now })).toBe(false);
		expect(isTaskOverdue({ dueAt: now - 1, status: "completed", now })).toBe(false);
		expect(isTaskOverdue({ dueAt: null, status: "pending", now })).toBe(false);
	});

	it("labels overdue vs upcoming dues", () => {
		expect(taskDueLabel({ dueAt: now - 60_000, status: "pending", now })).toMatch(/^Overdue · /);
		expect(taskDueLabel({ dueAt: now + 60_000, status: "pending", now })).toMatch(/^Due /);
		expect(taskDueLabel({ dueAt: null, status: "pending", now })).toBeNull();
	});
});
