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
		// WebKit rejects screenshots when a long page exceeds its 32,767 px
		// bitmap limit. The smoke test only needs visual evidence of the active
		// viewport; individual assertions cover the rest of each journey.
		fullPage: false,
	});
}

test.describe("release smoke: public surfaces", () => {
	test("landing leads through the demo launcher to the public schedule", async ({ page }, testInfo) => {
		await page.goto("/");
		await expect(page.locator('main a[href="/admin"]').first()).toBeVisible();
		await screenshot("01-landing", testInfo, page);

		await page.getByRole("link", { name: "Open the demo CFP" }).first().click();
		await expect(page).toHaveURL(new RegExp(`/e/${DEMO_EVENT_SLUG}/submit/cfp`));
		await expect(page.getByText("Read-only demo").first()).toBeVisible();
		await screenshot("02-demo-cfp", testInfo, page);

		await page.goto("/demo");
		await expect(page.getByRole("navigation", { name: "Demo perspective" })).toBeVisible();
		await expect(page.getByText("Playable read-only surfaces")).toBeVisible();

		const perspectiveNav = page.getByRole("navigation", { name: "Demo perspective" });
		for (const [label, perspective, title] of [
			["Organizer", "organizer", "Full lifecycle walkthrough"],
			["Reviewer", "reviewer", "Review needs your event"],
			["Speaker", "speaker", "Portal needs your invite"],
			["Attendee", "attendee", "Published program"],
		] as const) {
			// Click by href + wait for the card title. WebKit was flaking on
			// name-matched soft-nav after the taller organizer walkthrough card:
			// URL stayed on ?perspective=organizer while the next click raced the RSC.
			const tab = perspectiveNav.locator(`a[href="/demo?perspective=${perspective}"]`);
			await Promise.all([
				page.waitForURL(new RegExp(`/demo\\?perspective=${perspective}`)),
				tab.click(),
			]);
			await expect(tab).toHaveAttribute("aria-current", "page");
			await expect(page.getByRole("heading", { level: 2, name: title })).toBeVisible();
			await expect(perspectiveNav.getByRole("link", { name: label, exact: true })).toHaveAttribute(
				"aria-current",
				"page",
			);
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
