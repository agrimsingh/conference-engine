import type { CfpFormRow } from "@/lib/db/types";

/** True when closes_at is set and already past `nowMs` (request time). */
export function isCfpPastClosesAt(
	form: Pick<CfpFormRow, "closes_at">,
	nowMs: number = Date.now(),
): boolean {
	return form.closes_at !== null && form.closes_at < nowMs;
}
