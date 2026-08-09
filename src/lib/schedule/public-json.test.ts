import { describe, expect, it } from "vitest";
import { publicScheduleJsonContainsPii } from "./public-json";

describe("publicScheduleJsonContainsPii", () => {
	it("flags contact and raw answer fields", () => {
		expect(publicScheduleJsonContainsPii({ speakers: [{ email: "a@b.com" }] })).toBe(true);
		expect(publicScheduleJsonContainsPii({ submitterEmail: "a@b.com" })).toBe(true);
		expect(publicScheduleJsonContainsPii({ answers_json: "{}" })).toBe(true);
	});

	it("allows public speaker names without emails", () => {
		expect(publicScheduleJsonContainsPii({
			slots: [{ speakers: [{ name: "Pat Public", personId: "p1", hasHeadshot: true }] }],
		})).toBe(false);
	});
});
