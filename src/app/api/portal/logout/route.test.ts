import { describe, expect, it, vi } from "vitest";

const clearPortalSession = vi.hoisted(() => vi.fn());

vi.mock("@/lib/speakers/portal-session", () => ({ clearPortalSession }));

import { POST } from "./route";

describe("portal logout route", () => {
	it("clears the portal session and redirects to the portal with See Other", async () => {
		const response = await POST(
			new Request("https://conference.example.test/api/portal/logout", { method: "POST" }),
		);

		expect(clearPortalSession).toHaveBeenCalledOnce();
		expect(response.status).toBe(303);
		expect(new URL(response.headers.get("location") ?? "https://invalid.test")).toMatchObject({
			origin: "https://conference.example.test",
			pathname: "/portal",
			search: "",
		});
	});
});
