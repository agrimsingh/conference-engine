import { describe, expect, it } from "vitest";
import { BulkDecisionValidationError, parseBulkDecisionEmail } from "./decisions";

describe("parseBulkDecisionEmail", () => {
	it("defaults to no email and validates override payloads", () => {
		expect(parseBulkDecisionEmail(undefined)).toEqual({ send: false });
		expect(parseBulkDecisionEmail({ send: false })).toEqual({ send: false });
		expect(parseBulkDecisionEmail({ send: true, subject: " Hi ", text: " Body " })).toEqual({
			send: true,
			subject: "Hi",
			text: "Body",
		});
		expect(() => parseBulkDecisionEmail({ send: true, subject: "", text: "x" })).toThrow(BulkDecisionValidationError);
		expect(() => parseBulkDecisionEmail("nope")).toThrow(BulkDecisionValidationError);
	});
});
