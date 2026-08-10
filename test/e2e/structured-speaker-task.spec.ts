import { expect, test } from "@playwright/test";

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:8787";
const localWriteMode = process.env.PLAYWRIGHT_LOCAL_WRITE_TESTS === "1" && ["127.0.0.1", "localhost", "::1"].includes(new URL(baseURL).hostname);

test("an organizer can build and save a structured speaker task", async ({ page }) => {
	test.skip(!localWriteMode, "Structured task writes run only against a loopback app.");
	const slug = `structured-task-${Date.now()}`;
	await page.goto("/admin/bypass?next=/admin");
	await page.getByLabel("Event name").fill("Structured task browser proof");
	await page.getByLabel("Start date").fill("2030-11-01");
	await page.getByLabel("End date").fill("2030-11-01");
	await page.getByLabel("Slug").fill(slug);
	await page.getByLabel("Timezone").fill("UTC");
	await page.getByRole("button", { name: "Create event" }).click();
	await page.goto(`/admin/events/${slug}/settings?section=tasks`);

	const create = page.locator("#tasks form").first();
	await create.getByLabel("Task key").fill("travel-details");
	await create.getByLabel("Task label").fill("Travel details");
	await create.getByLabel("Kind").selectOption("form");
	await expect(create.getByText("Questions")).toBeVisible();
	await create.getByLabel("Question label").fill("Arrival time");
	await create.getByLabel("Answer key").fill("arrival-time");
	await create.getByRole("button", { name: "Add question" }).click();
	await create.getByLabel("Question label").nth(1).fill("Dietary needs");
	await create.getByLabel("Answer key").nth(1).fill("dietary-needs");
	await create.getByLabel("Answer type").nth(1).selectOption("select");
	await create.getByLabel("Choices (comma separated)").fill("None, Vegetarian, Vegan");
	await create.getByRole("button", { name: "Add task" }).click();

	await expect(page.getByText("Saved.")).toBeVisible();
	const saved = page.locator("#tasks li").filter({ has: page.locator('input[name="label"][value="Travel details"]') });
	await expect(saved.getByLabel("Kind")).toHaveValue("form");
	await expect(saved.locator('input[value="Arrival time"]')).toBeVisible();
	await expect(saved.locator('input[value="None, Vegetarian, Vegan"]')).toBeVisible();
});
