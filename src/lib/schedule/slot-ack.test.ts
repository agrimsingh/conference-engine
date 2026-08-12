import { describe, expect, it } from "vitest";
import { needsSlotAcknowledgement } from "./slot-ack";

describe("needsSlotAcknowledgement", () => {
	it("is false until a move marks the slot", () => {
		expect(
			needsSlotAcknowledgement({
				ackRequired: false,
				currentSequence: 1,
				acknowledgedSequence: null,
			}),
		).toBe(false);
	});

	it("is true after a move until the speaker acks the new sequence", () => {
		expect(
			needsSlotAcknowledgement({
				ackRequired: true,
				currentSequence: 3,
				acknowledgedSequence: 2,
			}),
		).toBe(true);
		expect(
			needsSlotAcknowledgement({
				ackRequired: true,
				currentSequence: 3,
				acknowledgedSequence: 3,
			}),
		).toBe(false);
	});
});
