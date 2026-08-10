import { describe, expect, it } from "vitest";
import { getPlacementFeedback } from "./placement-feedback";

describe("getPlacementFeedback", () => {
	it.each([
		{
			label: "queued",
			input: {
				calendarInviteStatus: "queued" as const,
				email: { ok: false as const, status: "failed", error: "provider error" },
				icsBytesLength: 42,
			},
			expected: "Placed · calendar invite queued. Delivery status appears in Comms.",
		},
		{
			label: "not applicable",
			input: { calendarInviteStatus: "not_applicable" as const },
			expected: "Placed · no calendar invite queued because this submission has no submitter email.",
		},
		{
			label: "sent",
			input: { email: { ok: true as const, status: "sent" }, icsBytesLength: 42 },
			expected: "Placed · calendar invite emailed to speaker(s).",
		},
		{
			label: "skipped",
			input: { email: { ok: true as const, status: "skipped" }, icsBytesLength: 42 },
			expected: "Placed · calendar invite skipped (demo or mail disabled).",
		},
		{
			label: "failed",
			input: {
				email: { ok: false as const, status: "failed", error: "provider error" },
				icsBytesLength: 42,
			},
			expected: "Placed · calendar invite failed: provider error. Session is still on the grid.",
		},
		{
			label: "prepared",
			input: { email: null, icsBytesLength: 42 },
			expected: "Placed · calendar invite prepared.",
		},
		{
			label: "fallback",
			input: { email: null, icsBytesLength: 0 },
			expected: "Placed on the grid. Publish when you want it public.",
		},
	] as const)("returns $label feedback with the intended precedence", ({ input, expected }) => {
		expect(getPlacementFeedback(input)).toBe(expected);
	});
});
