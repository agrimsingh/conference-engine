import { describe, expect, it } from "vitest";
import { isEventCfpPresetId } from "./create-event";

describe("isEventCfpPresetId", () => {
	it("accepts only minimal and conference", () => {
		expect(isEventCfpPresetId("minimal")).toBe(true);
		expect(isEventCfpPresetId("conference")).toBe(true);
		expect(isEventCfpPresetId("aie")).toBe(false);
		expect(isEventCfpPresetId("")).toBe(false);
		expect(isEventCfpPresetId(null)).toBe(false);
	});
});
