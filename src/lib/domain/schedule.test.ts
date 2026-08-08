import { describe, expect, it } from "vitest";
import {
	isPublicScheduleStatus,
	PUBLIC_SCHEDULE_STATUSES,
} from "./schedule";

describe("isPublicScheduleStatus", () => {
	it("accepts only published", () => {
		expect(PUBLIC_SCHEDULE_STATUSES).toEqual(["published"]);
		expect(isPublicScheduleStatus("published")).toBe(true);
	});

	it("rejects scheduled and other statuses", () => {
		expect(isPublicScheduleStatus("scheduled")).toBe(false);
		expect(isPublicScheduleStatus("accepted")).toBe(false);
		expect(isPublicScheduleStatus("draft")).toBe(false);
	});
});
