import { expect, test, type Page } from "@playwright/test";

const eventSlug = "demo-cfp-to-stage";

async function openWidget(page: Page, slug: string): Promise<void> {
	await page.goto(`/embed/${eventSlug}/widgets/${slug}`);
	await expect(page.getByRole("heading", { name: "CFP to Stage Demo" })).toBeVisible();
}

test("sessions widget searches titles and speakers, filters facets, and expands descriptions", async ({ page }) => {
	await openWidget(page, "sessions");
	const search = page.getByPlaceholder("Title or speaker name");
	await expect(page.getByText("4 results", { exact: true })).toBeVisible();

	await search.fill("recover");
	await expect(page.getByText("1 result", { exact: true })).toBeVisible();
	await expect(page.getByRole("link", { name: "Shipping agents that recover" })).toBeVisible();
	await expect(page.getByRole("link", { name: "Eval pipelines in CI" })).toHaveCount(0);

	await search.fill("Diallo");
	await expect(page.getByText("1 result", { exact: true })).toBeVisible();
	await expect(page.getByRole("link", { name: "Shipping agents that recover" })).toBeVisible();
	await search.fill("");

	await page.getByLabel("Track").selectOption({ label: "Agents" });
	await expect(page.getByText("2 results", { exact: true })).toBeVisible();
	await page.getByLabel("Track").selectOption("all");
	await page.getByLabel("Format").selectOption({ label: "Lightning" });
	await expect(page.getByText("1 result", { exact: true })).toBeVisible();
	await page.getByLabel("Format").selectOption("all");
	await page.getByLabel("Room").selectOption({ label: "Main Stage" });
	await expect(page.getByText("4 results", { exact: true })).toBeVisible();

	await page.getByRole("button", { name: "Show more" }).click();
	await expect(page.getByRole("button", { name: "Show less" })).toBeVisible();
	await expect(page.getByText(/the operator needs an honest view of what happened/)).toBeVisible();
});

test("speaker directory searches by exact name and opens the public detail", async ({ page }) => {
	await openWidget(page, "speakers");
	await page.getByPlaceholder("Speaker name").fill("Amara Diallo");
	await expect(page.getByText("1 speaker", { exact: true })).toBeVisible();
	await expect(page.getByText("Resilient Labs", { exact: false })).toBeVisible();

	const popupPromise = page.waitForEvent("popup");
	await page.getByRole("link", { name: "Amara Diallo" }).click();
	const detail = await popupPromise;
	await detail.waitForLoadState("domcontentloaded");
	await expect(detail.getByRole("heading", { name: "Amara Diallo" })).toBeVisible();
	await expect(detail.getByText("Staff Engineer", { exact: false })).toBeVisible();
	await expect(detail.getByRole("link", { name: "Shipping agents that recover" })).toBeVisible();
	await detail.close();
});

test("agenda opens and closes a rich session detail", async ({ page }) => {
	await openWidget(page, "agenda");
	await page.getByRole("button", { name: "Open details for Shipping agents that recover" }).click();
	const detail = page.getByLabel("Shipping agents that recover details");
	await expect(detail).toBeVisible();
	await expect(detail.getByText("Room: Main Stage", { exact: true })).toBeVisible();
	await expect(detail.getByText(/Format: Stage/)).toBeVisible();
	await expect(detail.getByText(/Track: Agents/)).toBeVisible();
	await expect(detail.getByText(/9:00 AM.*9:45 AM/)).toBeVisible();
	await detail.getByRole("button", { name: "Close details" }).click();
	await expect(detail).toHaveCount(0);
});

test("speaker gallery searches, opens rich details, and returns to the intact grid", async ({ page }) => {
	await openWidget(page, "speaker-gallery");
	await page.getByPlaceholder("Speaker name").fill("Amara Diallo");
	await expect(page.getByText("1 speaker", { exact: true })).toBeVisible();
	const trigger = page.getByRole("button", { name: "View details for Amara Diallo" });
	await trigger.click();
	const dialog = page.getByRole("dialog", { name: "Amara Diallo" });
	await expect(dialog).toBeVisible();
	await expect(dialog.getByText(/Staff Engineer.*Resilient Labs/)).toBeVisible();
	await expect(dialog.getByRole("link", { name: "Shipping agents that recover" })).toBeVisible();
	await dialog.getByRole("button", { name: "Close details" }).click();
	await expect(dialog).toHaveCount(0);
	await expect(trigger).toBeFocused();
});
