import { describe, expect, it } from "vitest";
import {
	ADMIN_EVENT_GROUPS,
	ADMIN_EVENT_LINKS,
	adminEventPath,
} from "./admin-event-nav";

describe("AdminEventNav paths", () => {
	it("keeps organizer review navigation within the scoped admin workspace", () => {
		expect(ADMIN_EVENT_LINKS).toContainEqual({ segment: "review", label: "Review" });
		expect(adminEventPath("ai-summit", "review")).toBe("/admin/events/ai-summit/review");
	});

	it("exposes the speaker roster under the event admin chrome", () => {
		expect(ADMIN_EVENT_LINKS).toContainEqual({ segment: "speakers", label: "Speakers" });
		expect(adminEventPath("ai-summit", "speakers")).toBe("/admin/events/ai-summit/speakers");
	});

	it("exposes the embed builder under the event admin chrome", () => {
		expect(ADMIN_EVENT_LINKS).toContainEqual({ segment: "embeds", label: "Embeds" });
		expect(adminEventPath("ai-summit", "embeds")).toBe("/admin/events/ai-summit/embeds");
	});

	it("groups every event destination once so the primary nav never becomes a scrolling rail", () => {
		const groupedLinks = ADMIN_EVENT_GROUPS.reduce<
			(typeof ADMIN_EVENT_LINKS)[number][]
		>((links, group) => [...links, ...group.links], []);
		const groupedSegments = groupedLinks.map((link) => link.segment);

		expect(ADMIN_EVENT_GROUPS.map((group) => group.label)).toEqual([
			"Overview",
			"Program",
			"Speakers",
			"Manage",
		]);
		expect(groupedLinks).toHaveLength(ADMIN_EVENT_LINKS.length);
		expect(new Set(groupedSegments).size).toBe(ADMIN_EVENT_LINKS.length);
		expect(groupedSegments).toEqual(ADMIN_EVENT_LINKS.map((link) => link.segment));
	});
});
