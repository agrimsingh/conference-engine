import { describe, expect, it } from "vitest";
import { GET } from "./route";

describe("public embed loader route", () => {
	it("returns a script that safely mounts the configured widget iframe", async () => {
		const response = await GET(new Request("https://events.example/api/e/devflow/embeds/program/loader.js"), {
			params: Promise.resolve({ eventSlug: "devflow", embedSlug: "program" }),
		});
		const script = await response.text();

		expect(response.headers.get("content-type")).toContain("javascript");
		expect(response.headers.get("access-control-allow-origin")).toBe("*");
		expect(script).toContain('customElements.define("conference-engine-embed"');
		expect(script).toContain("/embed/devflow/widgets/program");
		expect(script).toContain("document.createElement(\"iframe\")");
		expect(script).toContain('iframe.setAttribute("sandbox", "allow-scripts allow-same-origin allow-popups")');
		expect(script).not.toMatch(/allow-forms|allow-top-navigation|allow-storage-access|allow-downloads/);
		expect(script).not.toContain("innerHTML");
	});
});
