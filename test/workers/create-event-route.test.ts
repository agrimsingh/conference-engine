import { env } from "cloudflare:workers";
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	isAdminBypass: vi.fn(),
	getCurrentOrganizerAccount: vi.fn(),
}));

vi.mock("@/lib/db/cloudflare", () => ({ getDb: async () => env.DB }));
vi.mock("@/lib/auth/admin", () => ({
	isAdminBypass: mocks.isAdminBypass,
	getCurrentOrganizerAccount: mocks.getCurrentOrganizerAccount,
}));

import { POST } from "@/app/api/admin/events/route";

describe("POST /api/admin/events", () => {
	it("rejects unknown CFP presets with 400", async () => {
		mocks.isAdminBypass.mockResolvedValue(true);
		mocks.getCurrentOrganizerAccount.mockResolvedValue(null);

		const response = await POST(
			new Request("https://conference.example.test/api/admin/events", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({
					name: "Bad preset",
					slug: "bad-preset-event",
					startDay: "2026-09-01",
					endDay: "2026-09-02",
					preset: "aie",
				}),
			}),
		);

		expect(response.status).toBe(400);
		await expect(response.json()).resolves.toMatchObject({
			ok: false,
			error: expect.stringMatching(/minimal or conference/i),
		});
		expect(
			await env.DB.prepare("SELECT id FROM events WHERE slug = ?")
				.bind("bad-preset-event")
				.first(),
		).toBeNull();
	});
});
