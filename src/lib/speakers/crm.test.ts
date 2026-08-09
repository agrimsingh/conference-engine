import { describe, expect, it } from "vitest";
import {
	isSpeakerCrmActivityKind,
	normalizeSpeakerCrmTags,
} from "./crm";

describe("speaker CRM input", () => {
	it("keeps unique, bounded tags when the roster is updated", () => {
		// Given: organizer-entered tags with whitespace and case-only duplicates.
		const tags = [" VIP ", "travel", "vip", "", "green room"];

		// When: the CRM normalizes them at its input boundary.
		const result = normalizeSpeakerCrmTags(tags);

		// Then: the stored tag set is compact, readable, and deterministic.
		expect(result).toEqual({ ok: true, tags: ["VIP", "travel", "green room"] });
	});

	it("rejects malformed tag lists before they reach the database", () => {
		// Given: an untrusted API payload that exceeds the tag limit.
		const tags = Array.from({ length: 13 }, (_, index) => `tag-${index}`);

		// When: the CRM parses the payload.
		const result = normalizeSpeakerCrmTags(tags);

		// Then: it reports the boundary error instead of truncating silently.
		expect(result).toEqual({ ok: false, error: "Use up to 12 tags" });
	});

	it("accepts only timeline activity kinds", () => {
		// Given: the fixed CRM activity vocabulary.

		// When: values are checked at the API boundary.

		// Then: only note and contact events may be persisted.
		expect(isSpeakerCrmActivityKind("note")).toBe(true);
		expect(isSpeakerCrmActivityKind("contact")).toBe(true);
		expect(isSpeakerCrmActivityKind("email")).toBe(false);
	});
});
