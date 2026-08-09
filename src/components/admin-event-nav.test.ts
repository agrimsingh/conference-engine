import { describe, expect, it } from "vitest";
import { ADMIN_EVENT_LINKS, adminEventPath } from "./admin-event-nav";

describe("AdminEventNav paths", () => {
	it("keeps organizer review navigation within the scoped admin workspace", () => {
		expect(ADMIN_EVENT_LINKS).toContainEqual({ segment: "review", label: "Review" });
		expect(adminEventPath("ai-summit", "review")).toBe("/admin/events/ai-summit/review");
	});
});
