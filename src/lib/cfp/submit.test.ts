import { describe, expect, it } from "vitest";
import { validateCfpPayloadBounds } from "./submit";
import { validateFieldAnswer, type FormFieldDef } from "@/lib/domain/form-fields";

describe("CFP payload bounds", () => {
	it("enforces configured field maxLength", () => {
		const field: FormFieldDef = {
			key: "abstract",
			label: "Abstract",
			fieldType: "textarea",
			required: true,
			position: 0,
			visibilityRule: { op: "always" },
			config: { kind: "textarea", maxLength: 5 },
		};
		expect(validateFieldAnswer(field, "123456")).toBe("Abstract must be at most 5 characters");
		expect(validateFieldAnswer(field, "12345")).toBeNull();
	});

	it("rejects oversized and excessively wide answer maps", () => {
		expect(validateCfpPayloadBounds({ abstract: "x".repeat(200 * 1024) })).toBe("answers payload is too large");
		const wideAnswers = Object.fromEntries(Array.from({ length: 101 }, (_, index) => [`field_${index}`, "x"]));
		expect(validateCfpPayloadBounds(wideAnswers)).toBe("answers has too many fields");
	});
});
