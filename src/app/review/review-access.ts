type ReviewIdentityMode = { readonly mode: "committee" | "reviewer" };

export function canUseReviewDecisionControls(identity: ReviewIdentityMode, organizerBypass: boolean): boolean {
	return organizerBypass && identity.mode === "committee";
}
