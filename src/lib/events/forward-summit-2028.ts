import type { AccountRow } from "@/lib/db/types";
import {
	createEventWithDefaults,
	type CreateEventInput,
	type CreateEventResult,
} from "./create-event";

/** Canonical second-event fixture for CFP-17/18 multi-event coexistence checks. */
export const FORWARD_SUMMIT_2028 = {
	name: "Forward Summit 2028",
	slug: "forward-summit-2028",
	timezone: "America/Los_Angeles",
	startDay: "2028-06-12",
	endDay: "2028-06-14",
	preset: "conference",
} as const satisfies CreateEventInput;

export function createForwardSummit2028(
	db: D1Database,
	owner: AccountRow | null,
): Promise<CreateEventResult> {
	return createEventWithDefaults(db, { ...FORWARD_SUMMIT_2028 }, owner);
}
