import { describe, expect, it } from "vitest";
import { parsePortalResourceInput } from "./resources";

describe("portal resource input", () => {
	it("accepts escaped rich text and a published state", () => {
		const result = parsePortalResourceInput({
			title: "Speaker guide",
			slug: "speaker-guide",
			resourceType: "rich_text",
			content: "Bring your slides by Friday. <script>window.pwned = true</script>",
			published: true,
		});

		expect(result).toEqual({
			ok: true,
			value: {
				title: "Speaker guide",
				slug: "speaker-guide",
				resourceType: "rich_text",
				content: "Bring your slides by Friday. <script>window.pwned = true</script>",
				embedUrl: null,
				published: 1,
			},
		});
	});

	it("reduces an iframe snippet to a safe HTTPS source and rejects executable markup", () => {
		const valid = parsePortalResourceInput({
			title: "Venue map",
			slug: "venue-map",
			resourceType: "embed",
			embed: '<iframe width="600" src="https://maps.example.test/embed/venue" title="Venue map"></iframe>',
			published: false,
		});
		expect(valid).toMatchObject({ ok: true, value: { resourceType: "embed", content: "", embedUrl: "https://maps.example.test/embed/venue", published: 0 } });

		expect(parsePortalResourceInput({
			title: "Unsafe",
			slug: "unsafe",
			resourceType: "embed",
			embed: '<iframe src="https://maps.example.test/embed"></iframe><script>alert(1)</script>',
		})).toMatchObject({ ok: false });
		expect(parsePortalResourceInput({
			title: "Unsafe URL",
			slug: "unsafe-url",
			resourceType: "embed",
			embed: "javascript:alert(1)",
		})).toMatchObject({ ok: false });
	});
});
