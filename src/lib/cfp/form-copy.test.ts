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
		const context = { submitterName: "Ada", title: "Talk", eventName: "Event" };
		expect(confirmationCopyOverride(null, context)).toBeUndefined();
		expect(confirmationCopyOverride("Hi {{submitter_name}}", context)).toEqual({ subject: "We received your proposal for Event", text: "Hi Ada" });
	});
});
