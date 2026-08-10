import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	getDb: vi.fn(),
	getEventBySlug: vi.fn(),
	getPublicEmbedBySlug: vi.fn(),
}));

vi.mock("@/lib/db/cloudflare", () => ({ getDb: mocks.getDb }));
vi.mock("@/lib/db/queries", () => ({ getEventBySlug: mocks.getEventBySlug }));
vi.mock("@/lib/embeds/embed", () => ({ getPublicEmbedBySlug: mocks.getPublicEmbedBySlug }));

import { GET } from "./route";

describe("public embed loader route", () => {
	beforeEach(() => {
		mocks.getDb.mockReset();
		mocks.getEventBySlug.mockReset();
		mocks.getPublicEmbedBySlug.mockReset();
		mocks.getDb.mockResolvedValue({});
		mocks.getEventBySlug.mockResolvedValue({ id: "event-1", slug: "devflow" });
		mocks.getPublicEmbedBySlug.mockResolvedValue({
			id: "embed-1",
			slug: "program",
			status: "active",
		});
	});

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

	it("does not serve the loader when the embed is paused", async () => {
		mocks.getPublicEmbedBySlug.mockResolvedValue({
			id: "embed-1",
			slug: "program",
			status: "paused",
		});
		const response = await GET(new Request("https://events.example/api/e/devflow/embeds/program/loader.js"), {
			params: Promise.resolve({ eventSlug: "devflow", embedSlug: "program" }),
		});
		expect(response.status).toBe(404);
	});
});
