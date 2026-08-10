import { describe, expect, it } from "vitest";
import {
	parseContactEmail,
	REPLY_TO_TEMPLATE_FAMILIES,
	resolveEventReplyTo,
	templateUsesReplyTo,
	type ReplyToTemplateFamily,
} from "./reply-to";

describe("REPLY_TO_TEMPLATE_FAMILIES", () => {
	const families = Object.keys(REPLY_TO_TEMPLATE_FAMILIES) as ReplyToTemplateFamily[];

	it("covers the six acceptance families", () => {
		expect(families.sort()).toEqual(
			[
				"announcements",
				"calendar_invites",
				"confirmation",
				"decision",
				"portal_invite",
				"reminders",
			].sort(),
		);
	});

	it.each(families)("%s templates opt into Reply-To", (family) => {
		for (const key of REPLY_TO_TEMPLATE_FAMILIES[family]) {
			expect(templateUsesReplyTo(key)).toBe(true);
		}
	});

	it("keeps organizer auth and organizer fan-out without Reply-To", () => {
		expect(templateUsesReplyTo("organizer_magic_link")).toBe(false);
		expect(templateUsesReplyTo("organizer_invite")).toBe(false);
		expect(templateUsesReplyTo("submission_received_organizer")).toBe(false);
		expect(templateUsesReplyTo("submission_updated_organizer")).toBe(false);
	});
});

describe("parseContactEmail", () => {
	it("normalizes a valid address and treats blank as null", () => {
		expect(parseContactEmail("  Ada@Example.COM ")).toBe("ada@example.com");
		expect(parseContactEmail("")).toBe(null);
		expect(parseContactEmail("   ")).toBe(null);
		expect(parseContactEmail(null)).toBe(null);
	});

	it("rejects implausible addresses", () => {
		expect(() => parseContactEmail("not-an-email")).toThrow(/valid email/i);
	});
});

describe("resolveEventReplyTo", () => {
	function dbReturning(row: { contact_email: string | null; owner_email: string | null } | null) {
		return {
			prepare: () => ({
				bind: () => ({
					first: async () => row,
				}),
			}),
		} as unknown as D1Database;
	}

	it("prefers contact_email over the owner account email", async () => {
		await expect(
			resolveEventReplyTo(
				dbReturning({ contact_email: " Contact@Event.test ", owner_email: "owner@event.test" }),
				"evt-1",
			),
		).resolves.toBe("contact@event.test");
	});

	it("defaults to the owner account email when contact_email is empty", async () => {
		await expect(
			resolveEventReplyTo(
				dbReturning({ contact_email: null, owner_email: " Owner@Event.test " }),
				"evt-1",
			),
		).resolves.toBe("owner@event.test");
		await expect(
			resolveEventReplyTo(dbReturning({ contact_email: "  ", owner_email: "owner@event.test" }), "evt-1"),
		).resolves.toBe("owner@event.test");
	});
});
