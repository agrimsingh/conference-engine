import { describe, expect, it } from "vitest";
import { resolveAirtableConfig } from "./airtable";
import { syncOptInEventsToAirtable } from "./airtable-sync";

describe("syncOptInEventsToAirtable", () => {
	it("returns a configuration error when Airtable is not configured", async () => {
		const result = await syncOptInEventsToAirtable({ DB: {} as D1Database });
		expect(result).toMatchObject({
			syncedEvents: 0,
			skippedEvents: 0,
			upsertedRows: 0,
			configurationError: "Airtable is not configured",
		});
	});

	it("accepts a fully configured environment", () => {
		expect(resolveAirtableConfig({
			AIRTABLE_API_KEY: "key",
			AIRTABLE_BASE_ID: "base",
			AIRTABLE_TABLE_NAME: "Submissions",
		})).not.toBeNull();
	});
});
