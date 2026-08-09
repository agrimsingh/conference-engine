import { describe, expect, it } from "vitest";
import { defaultMessageTemplate, renderStoredMessageTemplate, upsertEventMessageTemplate } from "./templates";

describe("event message templates", () => {
	it("renders only the documented context tokens without leaving organizer placeholders", () => {
		const rendered = renderStoredMessageTemplate(
			{ subject: "{{event_name}} / {{title}}", text: "Hi {{submitter_name}}\n{{task_list}}\n{{portal_url}}\n{{unknown}}" },
			{ eventName: "AI Engineer Singapore", submitterName: "Ada", title: "Reliable agents", taskLabels: ["Bio", "Slides"], portalUrl: "https://example.test/portal" },
		);
		expect(rendered).toEqual({ subject: "AI Engineer Singapore / Reliable agents", text: "Hi Ada\n• Bio\n• Slides\nhttps://example.test/portal" });
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
});
