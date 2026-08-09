import type { CfpFormRow } from "@/lib/db/types";

type LifecycleForm = Pick<CfpFormRow, "opens_at" | "closes_at">;

/** True when opens_at is set and request time has not reached it yet. */
export function isCfpBeforeOpensAt(
	form: Pick<LifecycleForm, "opens_at">,
	nowMs: number = Date.now(),
): boolean {
	return form.opens_at !== null && form.opens_at > nowMs;
}

/** True when closes_at is set and request time has reached or passed it. */
export function isCfpPastClosesAt(
	form: Pick<LifecycleForm, "closes_at">,
	nowMs: number = Date.now(),
): boolean {
	return form.closes_at !== null && form.closes_at <= nowMs;
}

/** A status-open form also has to be inside its configured lifecycle window. */
export function isCfpOpenNow(form: LifecycleForm, nowMs: number = Date.now()): boolean {
	return !isCfpBeforeOpensAt(form, nowMs) && !isCfpPastClosesAt(form, nowMs);
}
