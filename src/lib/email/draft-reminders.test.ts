import { describe, expect, it } from "vitest";
import {
	DRAFT_REMINDER_WINDOW_MS,
	evaluateDraftReminderEligibility,
} from "./draft-reminders";

describe("evaluateDraftReminderEligibility", () => {
	const closesAt = 1_700_000_000_000;
	const windowMs = DRAFT_REMINDER_WINDOW_MS;

	it("requires a close date before any draft reminder can fire", () => {
		expect(evaluateDraftReminderEligibility({ closesAt: null, now: closesAt - 1 })).toEqual({
			eligible: false,
			reason: "no_close_date",
		});
	});

	it("stays silent until the pre-close window opens", () => {
		expect(
			evaluateDraftReminderEligibility({
				closesAt,
				now: closesAt - windowMs - 1,
				windowMs,
			}),
		).toEqual({ eligible: false, reason: "before_window" });
	});

	it("is eligible inside [closes_at - window, closes_at)", () => {
		expect(
			evaluateDraftReminderEligibility({
				closesAt,
				now: closesAt - windowMs,
				windowMs,
			}),
		).toEqual({ eligible: true, closesAt, windowStart: closesAt - windowMs });
		expect(
			evaluateDraftReminderEligibility({
				closesAt,
				now: closesAt - 1,
				windowMs,
			}),
		).toEqual({ eligible: true, closesAt, windowStart: closesAt - windowMs });
	});

	it("stops once the form has closed", () => {
		expect(evaluateDraftReminderEligibility({ closesAt, now: closesAt, windowMs })).toEqual({
			eligible: false,
			reason: "past_close",
		});
	});
});
