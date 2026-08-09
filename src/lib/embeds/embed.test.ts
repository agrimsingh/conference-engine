import { describe, expect, it } from "vitest";
import {
	buildEmbedUrls,
	parseStoredEmbedConfig,
	parseEmbedInput,
} from "./embed";

describe("embed configuration", () => {
	it("validates widget, branding, filters and visible fields", () => {
		expect(parseEmbedInput({
			name: "Main agenda",
			slug: "main-agenda",
			widgetType: "agenda",
			brandColor: "#2563eb",
			trackIds: ["track-main"],
			formats: ["Workshop"],
			rooms: ["Main Hall"],
			visibleFields: ["title", "time", "room", "speakers"],
		})).toMatchObject({ ok: true, value: { widgetType: "agenda", brandColor: "#2563eb" } });
	});

	it("rejects injection-shaped and unsupported configuration", () => {
		expect(parseEmbedInput({ name: "Bad", slug: "bad", widgetType: "script", brandColor: "red; background:url(javascript:alert(1))" })).toMatchObject({ ok: false });
		expect(parseEmbedInput({ name: "Bad", slug: "bad", widgetType: "agenda", visibleFields: ["email"] })).toMatchObject({ ok: false });
	});

	it("generates an escaped iframe snippet and public format URLs", () => {
		const urls = buildEmbedUrls("https://events.example", "ai-summit", "main-agenda");
		expect(urls.shareUrl).toBe("https://events.example/embed/ai-summit/widgets/main-agenda");
		expect(urls.jsonUrl).toBe("https://events.example/api/e/ai-summit/embeds/main-agenda");
		expect(urls.icalUrl).toBe("https://events.example/api/e/ai-summit/embeds/main-agenda/ical");
		expect(urls.htmlUrl).toBe("https://events.example/api/e/ai-summit/embeds/main-agenda/html");
		expect(urls.xmlUrl).toBe("https://events.example/api/e/ai-summit/embeds/main-agenda/xml");
		expect(urls.iframeSnippet).toContain('sandbox="allow-same-origin allow-popups"');
		expect(urls.iframeSnippet).not.toContain("<script");
		expect(urls.loaderUrl).toBe("https://events.example/api/e/ai-summit/embeds/main-agenda/loader.js");
		expect(urls.scriptSnippet).toContain("<conference-engine-embed");
		expect(urls.scriptSnippet).toContain('<script type="module"');
	});

	it("uses widget-appropriate defaults and sanitizes stored configuration", () => {
		expect(parseEmbedInput({
			name: "Speaker gallery",
			slug: "gallery",
			widgetType: "speaker_gallery",
		})).toMatchObject({
			ok: true,
			value: { visibleFields: ["headshot", "jobTitle", "company", "bio"] },
		});
		expect(parseStoredEmbedConfig("sessions", {
			brandColor: "red; background:url(javascript:alert(1))",
			trackIds: ["valid", "<script>"],
			visibleFields: ["title", "email", "abstract"],
		})).toEqual({
			brandColor: "#2563eb",
			trackIds: [],
			formats: [],
			rooms: [],
			visibleFields: ["title", "abstract"],
		});
	});
});
