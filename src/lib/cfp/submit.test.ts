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

	it("rejects duplicate speaker emails case-insensitively", () => {
		const field: FormFieldDef = {
			key: "speakers",
			label: "Speakers",
			fieldType: "speaker_block",
			required: true,
			position: 0,
			visibilityRule: { op: "always" },
			config: { kind: "speaker_block", minSpeakers: 1, maxSpeakers: 4 },
		};
		const dup = [
			{ name: "Ada", email: "ada@example.test" },
			{ name: "Ada Again", email: "ADA@example.test " },
		];
		expect(validateFieldAnswer(field, dup)).toBe("Each speaker needs a distinct email");
		const distinct = [
			{ name: "Ada", email: "ada@example.test" },
			{ name: "Grace", email: "grace@example.test" },
		];
		expect(validateFieldAnswer(field, distinct)).toBeNull();
	});
});
