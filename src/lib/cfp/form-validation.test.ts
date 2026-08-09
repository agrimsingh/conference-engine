import { describe, expect, it } from "vitest";
import type { FormFieldDef } from "@/lib/domain";
import { missingRequiredVisibleMultiselect } from "./form-validation";

const topics: FormFieldDef = {
	key: "topics",
	label: "Topics",
	fieldType: "multiselect",
	required: true,
	position: 0,
	visibilityRule: { op: "always" },
	config: { kind: "multiselect", options: [{ value: "agents", label: "Agents" }] },
};

describe("missingRequiredVisibleMultiselect", () => {
	it("finds a required visible multiselect whose answer is empty", () => {
		expect(missingRequiredVisibleMultiselect([topics], { topics: [] })).toBe(topics);
	});

	it("allows a selected value and ignores fields that are not visible", () => {
		expect(missingRequiredVisibleMultiselect([topics], { topics: ["agents"] })).toBeNull();
		expect(missingRequiredVisibleMultiselect([], { topics: [] })).toBeNull();
	});
});
