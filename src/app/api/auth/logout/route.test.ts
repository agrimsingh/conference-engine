import { describe, expect, it, vi } from "vitest";

const clearOrganizerSession = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/organizer-session", () => ({ clearOrganizerSession }));

import { POST } from "./route";

describe("organizer logout route", () => {
	it("clears the organizer session and redirects with See Other", async () => {
		const response = await POST(
			new Request(
				"https://conference.example.test/api/auth/logout?next=/admin/events/example?tab=review",
				{ method: "POST" },
			),
		);

		expect(clearOrganizerSession).toHaveBeenCalledOnce();
		expect(response.status).toBe(303);
		expect(new URL(response.headers.get("location") ?? "https://invalid.test")).toMatchObject({
			origin: "https://conference.example.test",
			pathname: "/admin/events/example",
			search: "?tab=review",
		});
	});

	it("falls back to login for an unsafe redirect target", async () => {
		const response = await POST(
			new Request("https://conference.example.test/api/auth/logout?next=https://evil.test", {
				method: "POST",
			}),
		);

		expect(response.status).toBe(303);
		expect(new URL(response.headers.get("location") ?? "https://invalid.test")).toMatchObject({
			origin: "https://conference.example.test",
			pathname: "/login",
			search: "",
		});
	});
});
