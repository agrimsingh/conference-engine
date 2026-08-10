import { describe, expect, it, vi } from "vitest";
import { mintPortalSignInLink } from "./mint-portal-link";

describe("mintPortalSignInLink", () => {
	it("returns an absolute /portal/authorize URL with the minted token", async () => {
		const run = vi.fn(async () => ({ success: true }));
		const db = {
			prepare: vi.fn(() => ({
				bind: vi.fn(() => ({ run })),
			})),
		} as unknown as D1Database;

		const minted = await mintPortalSignInLink(db, {
			secret: "test-secret",
			personId: "person-1",
			eventId: "event-1",
			origin: "https://example.test",
			now: 1_700_000_000_000,
		});

		expect(minted.portalUrl).toMatch(
			/^https:\/\/example\.test\/portal\/authorize\?token=[A-Za-z0-9_-]+$/,
		);
		expect(minted.token.length).toBeGreaterThan(16);
		expect(minted.expiresAt).toBe(1_700_000_000_000 + 15 * 60_000);
		expect(run).toHaveBeenCalledOnce();
	});
});
