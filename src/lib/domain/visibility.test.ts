import { describe, expect, it } from "vitest";
import {
	evaluateVisibilityRule,
	isVisibilityRule,
	parseVisibilityRule,
} from "./visibility";

describe("isVisibilityRule", () => {
	it("accepts always/never", () => {
		expect(isVisibilityRule({ op: "always" })).toBe(true);
		expect(isVisibilityRule({ op: "never" })).toBe(true);
	});

	it("rejects malformed eq/in/and", () => {
		expect(isVisibilityRule({ op: "eq", fieldKey: "x" })).toBe(false);
		expect(isVisibilityRule({ op: "in", fieldKey: "x", values: [1] })).toBe(
			false,
		);
		expect(isVisibilityRule({ op: "and", rules: [{ op: "maybe" }] })).toBe(
			false,
		);
		expect(isVisibilityRule(null)).toBe(false);
	});

	it("keeps in rules exact and non-empty", () => {
		expect(isVisibilityRule({ op: "in", fieldKey: "format", values: [] })).toBe(false);
		expect(evaluateVisibilityRule({ op: "in", fieldKey: "format", values: ["stage", "workshop"] }, { format: "workshop" })).toBe(true);
	});
});

describe("evaluateVisibilityRule", () => {
	it("handles eq / in / and", () => {
		expect(
			evaluateVisibilityRule(
				{ op: "eq", fieldKey: "format", value: "stage" },
				{ format: "stage" },
			),
		).toBe(true);
		expect(
			evaluateVisibilityRule(
				{ op: "in", fieldKey: "format", values: ["stage", "workshop"] },
				{ format: "online" },
			),
		).toBe(false);
		expect(
			evaluateVisibilityRule(
				{
					op: "and",
					rules: [
						{ op: "eq", fieldKey: "format", value: "workshop" },
						{ op: "neq", fieldKey: "format", value: "stage" },
					],
				},
				{ format: "workshop" },
			),
		).toBe(true);
	});
});

describe("parseVisibilityRule", () => {
	it("parses valid JSON and throws on invalid", () => {
		expect(parseVisibilityRule('{"op":"always"}')).toEqual({ op: "always" });
		expect(() => parseVisibilityRule('{"op":"nope"}')).toThrow(
			/Invalid visibility_rule/,
		);
	});
});
