import { describe, expect, it } from "vitest";
import { composeResumeDraftEmail, confirmationCopyOverride, renderFormCopy } from "./form-copy";

describe("renderFormCopy", () => {
	it("interpolates only the documented CFP lifecycle tokens", () => {
		expect(renderFormCopy("Hi {{submitter_name}} — {{title}} for {{event_name}}: {{resume_url}}", {
			submitterName: "Ada", title: "Reliable agents", eventName: "AI Engineer", resumeUrl: "https://example.test/draft",
		})).toBe("Hi Ada — Reliable agents for AI Engineer: https://example.test/draft");
	});

	it("keeps the actual resume URL even when custom welcome copy omits the token", () => {
		expect(composeResumeDraftEmail("Welcome, {{submitter_name}}.", {
			submitterName: "Ada", title: "Talk", eventName: "Event", resumeUrl: "https://example.test/draft",
		})).toContain("Resume your draft: https://example.test/draft");
	});

	it("uses confirmation copy only when an organizer provided it", () => {
		const context = { submitterName: "Ada", title: "Talk", eventName: "Event", portalUrl: "https://conference.example.test/portal" };
		expect(confirmationCopyOverride(null, context)).toBeUndefined();
		const override = confirmationCopyOverride("Hi {{submitter_name}}", context);
		const urls = override?.text.match(/https?:\/\/\S+/g) ?? [];
		expect(urls).toHaveLength(1);
		expect(new URL(urls[0] ?? "https://invalid.test")).toMatchObject({
			origin: "https://conference.example.test",
			pathname: "/portal",
			search: "",
		});
	});

	it("renders thank-you copy with the final submitter context", () => {
		expect(renderFormCopy("Thanks {{submitter_name}} for {{title}} at {{event_name}}", {
			submitterName: "Ada", title: "Reliable agents", eventName: "AI Engineer",
		})).toBe("Thanks Ada for Reliable agents at AI Engineer");
	});
});
