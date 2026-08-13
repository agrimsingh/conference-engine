import { describe, expect, it } from "vitest";
import {
	EDITABLE_MESSAGE_TEMPLATE_KEYS,
	defaultMessageTemplate,
	ensureRequiredMessageLink,
	renderDecisionMessagePreviews,
	renderStoredMessageTemplate,
	upsertEventMessageTemplate,
} from "./templates";

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
		expect(draft.subject).toContain("{{calendar_label}}");
		expect(draft.text).toContain("{{starts_at}}");
	});

	it("rejects a portal invite template that could strand a speaker", async () => {
		const db = { prepare: () => ({ bind: () => ({ first: async () => null }) }) } as unknown as D1Database;
		await expect(upsertEventMessageTemplate(db, { eventId: "event", templateKey: "portal_magic_link", subject: "Portal", text: "Please sign in" })).rejects.toThrow("{{portal_url}}");
	});

	it("adds the stable portal URL to a custom decision message without duplicating it", () => {
		const portalUrl = "https://conference.example.test/portal";
		const rendered = ensureRequiredMessageLink(
			"acceptance",
			{ subject: "Custom", text: "Custom body" },
			{ eventName: "Event", submitterName: "Ada", title: "Talk", portalUrl },
		);
		const urls = rendered.text.match(/https?:\/\/\S+/g) ?? [];
		expect(urls).toHaveLength(1);
		expect(new URL(urls[0] ?? "https://invalid.test")).toMatchObject({
			origin: "https://conference.example.test",
			pathname: "/portal",
			search: "",
		});

		const repeated = ensureRequiredMessageLink(
			"acceptance",
			rendered,
			{ eventName: "Event", submitterName: "Ada", title: "Talk", portalUrl },
		);
		expect(repeated.text.match(/https?:\/\/\S+/g)).toHaveLength(1);
	});

	it.each([
		"https://conference.example.test/portal?token=stale",
		"https://conference.example.test/portal#fragment",
		"https://conference.example.test/portal.evil",
	])("does not mistake the near-match %s for the canonical portal URL", (nearMatch) => {
		const portalUrl = "https://conference.example.test/portal";
		const rendered = ensureRequiredMessageLink(
			"acceptance",
			{ subject: "Custom", text: `Continue at ${nearMatch}` },
			{ eventName: "Event", submitterName: "Ada", title: "Talk", portalUrl },
		);

		const urls = rendered.text.match(/https?:\/\/\S+/g) ?? [];
		expect(urls).toContain(portalUrl);
		expect(urls.filter((url) => url === portalUrl)).toHaveLength(1);
	});

	it("builds decision previews from saved event templates with the same absolute portal link", () => {
		const portalUrl = "https://conference.example.test/portal";
		const previews = renderDecisionMessagePreviews(
			[
				{
					id: "saved-acceptance",
					event_id: "event",
					template_key: "acceptance",
					subject_template: "saved:acceptance",
					text_template: "saved:body",
					created_at: 1,
					updated_at: 1,
				},
			],
			{ eventName: "Event", submitterName: "Ada", title: "Talk", portalUrl },
		);

		expect(Object.keys(previews).sort()).toEqual(["accept", "reject", "waitlist"]);
		expect(previews.accept.subject).toBe("saved:acceptance");
		const urls = previews.accept.text.match(/https?:\/\/\S+/g) ?? [];
		expect(urls).toEqual([portalUrl]);
	});

	it("keeps every editable template renderable with non-empty output", () => {
		for (const key of EDITABLE_MESSAGE_TEMPLATE_KEYS) {
			const draft = defaultMessageTemplate(key);
			expect(draft.subject.trim()).not.toBe("");
			expect(draft.text.trim()).not.toBe("");
		}
	});
});
