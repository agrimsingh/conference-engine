import { defineConfig, devices } from "@playwright/test";

const baseURL = (process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:8787").replace(/\/$/, "");

const browserProjects = process.env.CI
	? [
			{ name: "chromium", use: { ...devices["Desktop Chrome"] } },
			{ name: "webkit", use: { ...devices["Desktop Safari"] } },
		]
	: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }];

export default defineConfig({
	testDir: "./test/e2e",
	fullyParallel: false,
	workers: 1,
	timeout: 30_000,
	expect: { timeout: 10_000 },
	forbidOnly: Boolean(process.env.CI),
	retries: process.env.CI ? 1 : 0,
	outputDir: "output/playwright/test-results",
	reporter: [
		["list"],
		["html", { outputFolder: "output/playwright/html-report", open: "never" }],
	],
	use: {
		baseURL,
		trace: "retain-on-failure",
		screenshot: "only-on-failure",
		video: "retain-on-failure",
	},
	projects: browserProjects,
	webServer: process.env.PLAYWRIGHT_SKIP_WEBSERVER
		? undefined
		: {
				command: process.env.CI
					? "npm run db:reset:local && npm run preview"
					: "npm run preview",
				url: baseURL,
				reuseExistingServer: !process.env.CI,
				timeout: 180_000,
			},
});
