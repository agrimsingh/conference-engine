import { describe, expect, it } from "vitest";
import { criteriaMutationError } from "./plan";

describe("criteriaMutationError", () => {
	it("lets drafts change anything and active rounds only add criteria", () => {
		expect(criteriaMutationError("draft", "add")).toBeNull();
		expect(criteriaMutationError("draft", "edit")).toBeNull();
		expect(criteriaMutationError("active", "add")).toBeNull();
		expect(criteriaMutationError("active", "edit")).toBe("Existing criteria are frozen once a plan is activated");
		expect(criteriaMutationError("closed", "add")).toBe("Cannot add criteria to a closed round");
		expect(criteriaMutationError("closed", "edit")).toBe("Existing criteria are frozen once a plan is activated");
	});
});
