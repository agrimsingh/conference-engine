import { describe, expect, it } from "vitest";
import { isScheduleAction } from "./actions";

describe("schedule actions", () => {
	it("accepts only queue-supported mutations", () => {
		expect(isScheduleAction("unplace")).toBe(true);
		expect(isScheduleAction("publish")).toBe(true);
		expect(isScheduleAction("unpublish")).toBe(true);
		expect(isScheduleAction("delete")).toBe(false);
		expect(isScheduleAction({ action: "publish" })).toBe(false);
	});
});
