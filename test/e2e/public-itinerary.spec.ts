import { expect, test, type TestInfo } from "@playwright/test";

const eventSlug = "demo-cfp-to-stage";

test("attendee switches days and builds a persistent personal schedule", async ({ page }, testInfo: TestInfo) => {
	await page.goto(`/e/${eventSlug}/schedule?view=itinerary`);
	await expect(page.getByRole("heading", { name: "Itinerary" })).toBeVisible();

	const dayLinks = page.getByRole("navigation", { name: "Event days" }).getByRole("link");
	expect(await dayLinks.count()).toBeGreaterThanOrEqual(2);
	await dayLinks.nth(1).click();
	await expect(dayLinks.nth(1)).toHaveAttribute("aria-current", "date");

	const addButton = page.getByRole("button", { name: /^Add .* to My Schedule$/ }).first();
	await addButton.click();
	await page.getByRole("button", { name: /^Add .* to My Schedule$/ }).first().click();
	await expect(page.getByRole("button", { name: /^Remove .* from My Schedule$/ })).toHaveCount(2);
	await page.reload();
	await expect(page.getByRole("button", { name: /^Remove .* from My Schedule$/ })).toHaveCount(2);

	await page.getByRole("tab", { name: /My Schedule/ }).click();
	await expect(page.getByRole("heading", { name: "My Schedule" })).toBeVisible();
	await expect(page.getByText("2 selected sessions.")).toBeVisible();
	await page.getByRole("button", { name: /^Remove .* from My Schedule$/ }).first().click();
	await expect(page.getByText("1 selected session.")).toBeVisible();
	await expect(page.getByRole("button", { name: /^Remove .* from My Schedule$/ })).toHaveCount(1);
	await expect(page.getByRole("button", { name: "Export selected sessions" })).toBeEnabled();
	const downloadPromise = page.waitForEvent("download");
	await page.getByRole("button", { name: "Export selected sessions" }).click();
	const download = await downloadPromise;
	expect(download.suggestedFilename()).toBe(`${eventSlug}-my-schedule.ics`);
	await download.saveAs(testInfo.outputPath("selected-sessions.ics"));
	await page.screenshot({ path: testInfo.outputPath("public-itinerary.png"), fullPage: true });
});
