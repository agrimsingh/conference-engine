import { describe, expect, it } from "vitest";
import { eventReadiness, type EventConfiguration } from "./configuration";

const complete: EventConfiguration = {
	event: { id: "event", name: "Conference", timezone: "Asia/Singapore", start_day: "2026-09-01", end_day: "2026-09-02", day_start_minutes: 540, day_end_minutes: 1080, slot_duration_minutes: 30 },
	rooms: [{ id: "room", name: "Main", position: 0 }],
	tracks: [{ id: "track", name: "General", slug: "general", position: 0 }],
	tasks: [{ id: "task", key: "bio", label: "Bio", task_kind: "text", required: 1, position: 0 }],
	cfp: { id: "cfp", slug: "cfp", title: "Call for papers", status: "open", fieldCount: 3 },
	review: { id: "review", name: "Default", status: "draft", criteriaCount: 1 },
};

describe("event readiness", () => {
	it("reports actual configuration and links incomplete items to their settings", () => {
		const pending = { ...complete, rooms: [], cfp: { ...complete.cfp!, status: "draft" as const, fieldCount: 0 } };
		const items = eventReadiness(pending, "sample");
		expect(items.find((item) => item.key === "rooms")).toMatchObject({ complete: false, href: "/admin/events/sample/settings#rooms" });
		expect(items.find((item) => item.key === "cfp")).toMatchObject({ complete: false, href: "/admin/events/sample/forms" });
		expect(items.find((item) => item.key === "review")).toMatchObject({ href: "/admin/events/sample/review" });
		expect(items.find((item) => item.key === "cfp-open")).toMatchObject({ complete: false });
	});

	it("marks each item ready only from persisted configuration", () => {
		expect(eventReadiness(complete, "sample").every((item) => item.complete)).toBe(true);
	});
});
