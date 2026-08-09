import { execFileSync } from "node:child_process";
import { createServer, type Server } from "node:http";
import { expect, test, type TestInfo } from "@playwright/test";

const appOrigin = (process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:8787").replace(/\/$/, "");
const eventSlug = "demo-cfp-to-stage";
const embedSlug = "e2e-cross-origin";
const isLoopback = ["127.0.0.1", "localhost", "::1"].includes(new URL(appOrigin).hostname);
let parentServer: Server | null = null;
let parentOrigin = "";

function runD1(command: string) {
	execFileSync("npx", ["wrangler", "d1", "execute", "conference-engine", "--local", "--command", command], {
		cwd: process.cwd(),
		stdio: "pipe",
	});
}

test.beforeAll(async () => {
	if (!isLoopback) return;
	const config = JSON.stringify({
		brandColor: "#2563eb",
		trackIds: [],
		formats: [],
		rooms: [],
		visibleFields: ["title", "time", "room", "track", "speakers", "abstract", "format", "jobTitle", "company"],
	}).replaceAll("'", "''");
	runD1(`INSERT OR REPLACE INTO public_embeds (id, event_id, name, slug, widget_type, config_json, created_at, updated_at) VALUES ('e2e-cross-origin', 'demo-cfp-to-stage-2026', 'Cross-origin sessions', '${embedSlug}', 'sessions', '${config}', 1790000000000, 1790000000000)`);
	parentServer = createServer((_request, response) => {
		response.setHeader("Content-Type", "text/html; charset=utf-8");
		response.end(`<!doctype html><html><body><conference-engine-embed src="${appOrigin}/embed/${eventSlug}/widgets/${embedSlug}"></conference-engine-embed><script type="module" src="${appOrigin}/api/e/${eventSlug}/embeds/${embedSlug}/loader.js"></script></body></html>`);
	});
	await new Promise<void>((resolve) => parentServer!.listen(0, "127.0.0.1", resolve));
	const address = parentServer.address();
	if (!address || typeof address === "string") throw new Error("Foreign-origin parent did not bind a TCP port");
	parentOrigin = `http://127.0.0.1:${address.port}`;
});

test.afterAll(async () => {
	if (!isLoopback) return;
	await new Promise<void>((resolve, reject) => parentServer?.close((error) => error ? reject(error) : resolve()));
	runD1(`DELETE FROM public_embeds WHERE id = 'e2e-cross-origin' AND event_id = 'demo-cfp-to-stage-2026'`);
});

test("foreign-origin custom element keeps session search interactive", async ({ page }, testInfo: TestInfo) => {
	test.skip(!isLoopback, "Cross-origin fixture requires a loopback D1 preview");
	await page.goto(parentOrigin);
	const widget = page.locator("conference-engine-embed iframe");
	await expect(widget).toHaveAttribute("sandbox", "allow-scripts allow-same-origin allow-popups");
	const child = page.frameLocator("conference-engine-embed iframe");
	await expect(child.getByRole("searchbox", { name: "Search sessions or speakers" })).toBeVisible();
	await child.getByRole("searchbox", { name: "Search sessions or speakers" }).fill("Maya");
	await expect(child.getByText("1 result", { exact: true })).toBeVisible();
	await expect(child.getByRole("link", { name: "Build a capable MCP server" })).toBeVisible();
	await page.screenshot({ path: testInfo.outputPath("foreign-origin-session-search.png"), fullPage: true });
});
