// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { EmbedBuilder } from "./embed-builder";

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
	container = document.createElement("div");
	document.body.appendChild(container);
	root = createRoot(container);
});

afterEach(async () => {
	await act(async () => root.unmount());
	container.remove();
});

describe("embed builder preview", () => {
	it("allows only the iframe capabilities required for interactive widgets", async () => {
		await act(async () => root.render(
			<EmbedBuilder
				eventSlug="devflow"
				trackOptions={[]}
				initialEmbeds={[{
					id: "embed-1",
					event_id: "event-1",
					name: "Sessions",
					slug: "sessions",
					widget_type: "sessions",
					status: "active",
					created_at: 1,
					updated_at: 1,
					config: { brandColor: "#2563eb", trackIds: [], formats: [], rooms: [], visibleFields: ["title"] },
					urls: {
						shareUrl: "https://events.example/embed/devflow/widgets/sessions",
						jsonUrl: "https://events.example/api/e/devflow/embeds/sessions",
						icalUrl: "https://events.example/api/e/devflow/embeds/sessions/ical",
						htmlUrl: "https://events.example/api/e/devflow/embeds/sessions/html",
						xmlUrl: "https://events.example/api/e/devflow/embeds/sessions/xml",
						loaderUrl: "https://events.example/api/e/devflow/embeds/sessions/loader.js",
						iframeSnippet: "<iframe></iframe>",
						scriptSnippet: "<conference-engine-embed></conference-engine-embed>",
					},
				}]}
			/>,
		));

		const iframe = container.querySelector("iframe");
		expect(iframe?.getAttribute("sandbox")).toBe("allow-scripts allow-same-origin allow-popups");
		expect(iframe?.getAttribute("sandbox")).not.toMatch(/allow-forms|allow-top-navigation|allow-storage-access|allow-downloads/);
	});
});
