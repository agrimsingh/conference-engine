import { describe, expect, it } from "vitest";
import {
	isProfileTaskKey,
	isSessionPrepTaskKey,
	speakerApplicationStatusLabel,
} from "./portal-view";

describe("portal-view", () => {
	it("maps organizer statuses to speaker-facing labels", () => {
		expect(speakerApplicationStatusLabel("submitted")).toBe("Submitted");
		expect(speakerApplicationStatusLabel("under_review")).toBe("In review");
		expect(speakerApplicationStatusLabel("rejected")).toBe("Declined");
		expect(speakerApplicationStatusLabel("published")).toBe("On the program");
	});

	it("splits profile tasks from session prep", () => {
		expect(isProfileTaskKey("bio")).toBe(true);
		expect(isProfileTaskKey("headshot")).toBe(true);
		expect(isProfileTaskKey("slides")).toBe(false);
		expect(isSessionPrepTaskKey("slides")).toBe(true);
		expect(isSessionPrepTaskKey("docs")).toBe(true);
		expect(isSessionPrepTaskKey("bio")).toBe(false);
		expect(isSessionPrepTaskKey("custom-av-form")).toBe(true);
	});
});
