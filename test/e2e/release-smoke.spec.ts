import { expect, test, type Page, type TestInfo } from "@playwright/test";

const DEMO_EVENT_SLUG = "demo-cfp-to-stage";
const LOCAL_EVENT_SLUG = "e2e-release-smoke";
const LOCAL_EVENT_NAME = "Release smoke event";
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:8787";
const localWriteMode = process.env.PLAYWRIGHT_LOCAL_WRITE_TESTS === "1" && isLoopback(baseURL);

function isLoopback(url: string): boolean {
	const hostname = new URL(url).hostname;
	return hostname === "127.0.0.1" || hostname === "localhost" || hostname === "::1";
}

async function screenshot(testName: string, testInfo: TestInfo, page: Page) {
	await page.screenshot({
		path: testInfo.outputPath(`${testName}.png`),
		fullPage: true,
	});
}

test.describe("release smoke: public surfaces", () => {
	test("landing leads through demo perspectives to the public schedule", async ({ page }, testInfo) => {
		await page.goto("/");
		await expect(page.getByRole("heading", { name: /CFP to stage/i })).toBeVisible();
		await screenshot("01-landing", testInfo, page);

		await page.getByRole("link", { name: "Explore demo" }).first().click();
		await expect(page).toHaveURL(/\/demo$/);
		await expect(page.getByText("Read-only demo data")).toBeVisible();
		await expect(page.getByRole("navigation", { name: "Demo perspective" })).toBeVisible();
		await screenshot("02-demo-applicant", testInfo, page);

		for (const [label, perspective] of [
			["Organizer", "organizer"],
			["Reviewer", "reviewer"],
			["Speaker", "speaker"],
			["Attendee", "attendee"],
		]) {
			await page.getByRole("link", { name: label }).click();
			await expect(page).toHaveURL(new RegExp(`/demo\\?perspective=${perspective}`));
			await expect(page.getByRole("link", { name: label })).toHaveAttribute("aria-current", "page");
		}
		await expect(page.getByText("Published program")).toBeVisible();
		await screenshot("03-demo-attendee", testInfo, page);

		await page.getByRole("link", { name: "Open public schedule" }).click();
		await expect(page).toHaveURL(new RegExp(`/e/${DEMO_EVENT_SLUG}/schedule`));
		await expect(page.getByText("Public schedule")).toBeVisible();
		await screenshot("04-public-schedule", testInfo, page);
	});
});

test.describe("release smoke: local organizer setup", () => {
	test.skip(
		!localWriteMode,
		"Organizer writes require PLAYWRIGHT_LOCAL_WRITE_TESTS=1 and a loopback preview.",
	);

	test("creates a local event and saves its setup through the browser", async ({ page }, testInfo) => {
		await page.goto("/admin/bypass?next=/admin");
		await expect(page).toHaveURL(/\/admin$/);

		const existingEvent = page.getByRole("link", { name: new RegExp(LOCAL_EVENT_NAME, "i") });
		if (await existingEvent.count()) {
			await existingEvent.click();
		} else {
			await page.getByLabel("Event name").fill(LOCAL_EVENT_NAME);
			await page.getByLabel("Start date").fill("2030-09-10");
			await page.getByLabel("End date").fill("2030-09-11");
			await page.getByLabel("Slug").fill(LOCAL_EVENT_SLUG);
			await page.getByLabel("Timezone").fill("UTC");
			await page.getByRole("button", { name: "Create event" }).click();
		}

		await expect(page).toHaveURL(new RegExp(`/admin/events/${LOCAL_EVENT_SLUG}/(?:setup|submissions)`));
		if (!page.url().endsWith("/setup")) await page.goto(`/admin/events/${LOCAL_EVENT_SLUG}/setup`);
		await expect(page.getByText("Organizer setup")).toBeVisible();
		await screenshot("05-local-setup", testInfo, page);

		await page.getByRole("link", { name: "Settings" }).click();
		await expect(page).toHaveURL(`/admin/events/${LOCAL_EVENT_SLUG}/settings`);
		await page.getByLabel("Event name").fill(LOCAL_EVENT_NAME);
		await page.getByLabel("Timezone").fill("UTC");
		await page.getByRole("button", { name: "Save event details" }).click();
		await expect(page.getByText("Saved.")).toBeVisible();
		await screenshot("06-local-settings", testInfo, page);

		await page.getByRole("link", { name: "Public schedule" }).click();
		await expect(page.getByText("Public schedule")).toBeVisible();
		await screenshot("07-local-public-schedule", testInfo, page);
	});
});
