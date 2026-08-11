import { describe, expect, it } from "vitest";
import {
	EDITABLE_MESSAGE_TEMPLATE_KEYS,
	defaultMessageTemplate,
	renderStoredMessageTemplate,
	upsertEventMessageTemplate,
} from "./templates";
import { MESSAGE_TEMPLATE_KEYS, renderMessageTemplate } from "@/lib/domain/message-templates";

const REPLY_CTA = "If anything looks off, just reply to this email.";

const SPEAKER_REVIEWER_TEMPLATE_KEYS = [
	"submission_received",
	"acceptance",
	"rejection",
	"waitlist",
	"co_speaker_invite",
	"calendar_invite",
	"task_reminder",
	"draft_reminder",
	"speaker_announcement",
	"portal_magic_link",
	"reviewer_invite",
	"reviewer_outstanding_reminder",
] as const;

describe("event message templates", () => {
	it("renders only the documented context tokens without leaving organizer placeholders", () => {
		const rendered = renderStoredMessageTemplate(
			{ subject: "{{event_name}} / {{title}}", text: "Hey {{submitter_name}}\n{{task_list}}\n{{portal_url}}\n{{unknown}}" },
			{ eventName: "AI Engineer Singapore", submitterName: "Ada", title: "Reliable agents", taskLabels: ["Bio", "Slides"], portalUrl: "https://example.test/portal" },
		);
		expect(rendered).toEqual({ subject: "AI Engineer Singapore / Reliable agents", text: "Hey Ada\n• Bio\n• Slides\nhttps://example.test/portal" });
	});

	it("keeps the built-in calendar copy editable with lifecycle variables", () => {
		const draft = defaultMessageTemplate("calendar_invite");
		expect(draft.subject).toContain("{{title}}");
		expect(draft.text).toContain("{{starts_at}}");
	});

	it("rejects a portal invite template that could strand a speaker", async () => {
		const db = { prepare: () => ({ bind: () => ({ first: async () => null }) }) } as unknown as D1Database;
		await expect(upsertEventMessageTemplate(db, { eventId: "event", templateKey: "portal_magic_link", subject: "Portal", text: "Please sign in" })).rejects.toThrow("{{portal_url}}");
	});

	it("uses Gmail-tone defaults with a reply CTA on every editable speaker template", () => {
		for (const key of EDITABLE_MESSAGE_TEMPLATE_KEYS) {
			const draft = defaultMessageTemplate(key);
			expect(draft.text.startsWith("Hey {{submitter_name}},")).toBe(true);
			expect(draft.text.endsWith(REPLY_CTA)).toBe(true);
			expect(draft.text).not.toContain("— conference-engine");
		}
	});

	it("keeps speaker/reviewer registry copy in the same voice with a reply CTA", () => {
		const ctx = {
			eventName: "DevFlow",
			submitterName: "Ada",
			title: "Reliable agents",
			portalHint: "Open the portal when ready.",
			portalUrl: "https://example.test/portal",
			confirmUrl: "https://example.test/confirm",
			declineUrl: "https://example.test/decline",
			reviewUrl: "https://example.test/review",
			taskLabels: ["Bio"],
			outstandingCount: 1,
			roomName: "Main",
			startsAtIso: "2026-01-01T00:00:00.000Z",
			endsAtIso: "2026-01-01T01:00:00.000Z",
		};
		for (const key of SPEAKER_REVIEWER_TEMPLATE_KEYS) {
			expect(MESSAGE_TEMPLATE_KEYS).toContain(key);
			const rendered = renderMessageTemplate(key, ctx);
			expect(rendered.text.startsWith("Hey Ada,")).toBe(true);
			expect(rendered.text.endsWith(REPLY_CTA)).toBe(true);
			expect(rendered.text).not.toContain("— conference-engine");
		}
	});
});
