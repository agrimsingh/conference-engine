export type ActivationReviewPath = {
	reviewPath: string;
	message: string;
};

/** The activation response is the only organizer response allowed to carry a
 * committee bearer path. Keep it in client state for immediate copying only. */
export function activationReviewPath(value: unknown): ActivationReviewPath | null {
	if (typeof value !== "object" || value === null || !("plan" in value)) return null;
	const plan = value.plan;
	if (typeof plan !== "object" || plan === null || !("reviewPath" in plan) || typeof plan.reviewPath !== "string" || !plan.reviewPath.startsWith("/review?token=")) return null;
	return {
		reviewPath: plan.reviewPath,
		message: "Copy this committee review link now. It is shown only after activation and cannot be recovered from this workspace.",
	};
}
