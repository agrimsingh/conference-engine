import { describe, expect, it } from "vitest";
import { parseCategoryRoute, resolveSubmissionCategory } from "./category-routing";

describe("database-configured category routing", () => {
	it("routes through stored config without using a form slug", () => {
		const route = parseCategoryRoute('{"fieldKey":"session_kind","map":{"workshop":"Hands-on","talk":"Talk"}}');
		expect(resolveSubmissionCategory(route, { session_kind: "workshop" })).toBe("Hands-on");
		expect(resolveSubmissionCategory(route, { session_kind: "other" })).toBeNull();
	});

	it("rejects malformed routing config", () => {
		expect(parseCategoryRoute('{"fieldKey":"format","map":{"stage":42}}')).toBeNull();
		expect(parseCategoryRoute("not json")).toBeNull();
	});
});
