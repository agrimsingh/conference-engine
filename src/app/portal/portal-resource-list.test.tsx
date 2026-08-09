// @vitest-environment jsdom
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PortalResourceList } from "./portal-resource-list";

describe("PortalResourceList", () => {
	it("escapes organizer notes and isolates usable embeds", () => {
		const html = renderToStaticMarkup(
			<PortalResourceList
				resources={[
					{ id: "guide", event_id: "event", title: "Guide", slug: "guide", resource_type: "rich_text", content: "Use <script>window.pwned = true</script>", embed_url: null, published: 1, position: 0, created_at: 1, updated_at: 1 },
					{ id: "map", event_id: "event", title: "Venue map", slug: "venue-map", resource_type: "embed", content: "", embed_url: "https://maps.example.test/embed", published: 1, position: 1, created_at: 1, updated_at: 1 },
				]}
			/>,
		);

		expect(html).toContain("&lt;script&gt;window.pwned = true&lt;/script&gt;");
		expect(html).toContain('sandbox="allow-scripts allow-popups allow-presentation"');
		expect(html).toContain('allow="fullscreen"');
		expect(html).not.toContain("allow-same-origin");
		expect(html).not.toContain("allow-top-navigation");
		expect(html).toContain("h-64");
		expect(html).toContain("sm:h-96");
	});
});
