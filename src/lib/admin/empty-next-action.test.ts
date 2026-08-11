import { describe, expect, it } from "vitest";
import { parseSection } from "@/app/admin/events/[eventSlug]/settings/settings-section";
import { emptyNextActionHref, type EmptyNextActionTarget } from "./empty-next-action";

describe("emptyNextActionHref", () => {
	it("builds settings section hrefs that parseSection accepts", () => {
		const cases: Array<{ target: EmptyNextActionTarget; section: string }> = [
			{ target: "settings.rooms", section: "rooms" },
			{ target: "settings.tracks", section: "tracks" },
			{ target: "settings.tasks", section: "tasks" },
		];
		for (const { target, section } of cases) {
			const href = emptyNextActionHref("aie-sandbox", target);
			expect(href).toBe(`/admin/events/aie-sandbox/settings?section=${section}`);
			expect(parseSection(section)).toBe(section);
		}
	});

	it("builds non-settings next-action paths", () => {
		expect(emptyNextActionHref("demo", "forms")).toBe("/admin/events/demo/forms");
		expect(emptyNextActionHref("demo", "submissions")).toBe(
			"/admin/events/demo/submissions",
		);
		expect(emptyNextActionHref("demo", "speakers.add")).toBe(
			"/admin/events/demo/speakers?panel=add",
		);
		expect(emptyNextActionHref("demo", "resources.create")).toBe(
			"/admin/events/demo/resources?section=create",
		);
		expect(emptyNextActionHref("demo", "tasks.deliverables")).toBe(
			"/admin/events/demo/tasks?section=deliverables",
		);
	});
});
