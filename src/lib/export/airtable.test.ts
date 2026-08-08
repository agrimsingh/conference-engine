import { describe, expect, it } from "vitest";
import { resolveAirtableConfig } from "./airtable";

describe("resolveAirtableConfig", () => {
	it("returns null when any required field is missing", () => {
		expect(resolveAirtableConfig({})).toBeNull();
		expect(
			resolveAirtableConfig({
				AIRTABLE_API_KEY: "key",
				AIRTABLE_BASE_ID: "base",
			}),
		).toBeNull();
		expect(
			resolveAirtableConfig({
				AIRTABLE_API_KEY: "  ",
				AIRTABLE_BASE_ID: "base",
				AIRTABLE_TABLE_NAME: "Submissions",
			}),
		).toBeNull();
	});

	it("trims and returns config when all fields present", () => {
		expect(
			resolveAirtableConfig({
				AIRTABLE_API_KEY: " key ",
				AIRTABLE_BASE_ID: " base ",
				AIRTABLE_TABLE_NAME: " Submissions ",
			}),
		).toEqual({
			apiKey: "key",
			baseId: "base",
			tableName: "Submissions",
		});
	});
});
