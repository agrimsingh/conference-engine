import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
	cookies: new Map<string, string>(),
	deletedCookies: [] as string[],
	deletedKvKeys: [] as string[],
}));

vi.mock("next/headers", () => ({
	cookies: async () => ({
		get: (name: string) => {
			const value = state.cookies.get(name);
			return value === undefined ? undefined : { name, value };
		},
		delete: (name: string) => {
			state.deletedCookies.push(name);
			state.cookies.delete(name);
		},
	}),
}));

vi.mock("@/lib/db/cloudflare", () => ({
	getSessionsKv: async () => ({
		delete: async (key: string) => {
			state.deletedKvKeys.push(key);
		},
	}),
}));

import { clearPortalSession, hasPortalEligibility, PORTAL_SESSION_COOKIE } from "./portal-session";
import type { SubmissionRow } from "@/lib/db/types";

const submitted = { id: "sub", status: "submitted" } as SubmissionRow;

describe("portal eligibility", () => {
	beforeEach(() => {
		state.cookies.clear();
		state.deletedCookies.length = 0;
		state.deletedKvKeys.length = 0;
	});

	it("allows any owned proposal, including one that is not accepted", () => {
		expect(hasPortalEligibility([submitted])).toBe(true);
		expect(hasPortalEligibility([])).toBe(false);
	});

	it("deletes only the current portal session", async () => {
		state.cookies.set(PORTAL_SESSION_COOKIE, "portal-token");
		state.cookies.set("ce_organizer_session", "organizer-token");

		await clearPortalSession();

		expect(state.deletedKvKeys).toEqual(["portal_session:portal-token"]);
		expect(state.deletedCookies).toEqual([PORTAL_SESSION_COOKIE]);
		expect(state.cookies.get("ce_organizer_session")).toBe("organizer-token");
	});
});
