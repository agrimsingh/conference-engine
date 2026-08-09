import { describe, expect, it } from "vitest";
import { DEFAULT_TASK_TEMPLATES } from "./task-templates";

describe("DEFAULT_TASK_TEMPLATES", () => {
	it("defines the four baseline tasks in display order", () => {
		expect(DEFAULT_TASK_TEMPLATES).toEqual([
			{ key: "bio", label: "Speaker bio", taskKind: "text", required: true, position: 0 },
			{ key: "headshot", label: "Headshot", taskKind: "file", required: true, position: 1 },
			{ key: "slides", label: "Slides", taskKind: "file", required: true, position: 2 },
			{ key: "docs", label: "Supporting docs", taskKind: "file", required: true, position: 3 },
		]);
	});
});
