import { describe, expect, it } from "vitest";
import { textTaskRules } from "./task-checklist";

describe("speaker task text input rules", () => {
	it("keeps the biography minimum specific to the built-in bio task", () => {
		expect(textTaskRules("bio")).toEqual({ minLength: 20, hint: " (20+ characters)" });
		expect(textTaskRules("talk-notes")).toEqual({ minLength: undefined, hint: "" });
	});
});
