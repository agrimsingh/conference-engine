export type PlacementFeedbackInput = {
	readonly calendarInviteStatus?: "queued" | "not_applicable";
	readonly email?:
		| { readonly ok: true; readonly status: string }
		| { readonly ok: false; readonly status: string; readonly error?: string }
		| null;
	readonly icsBytesLength?: number;
};

export function getPlacementFeedback(result: PlacementFeedbackInput): string {
	if (result.calendarInviteStatus === "queued") {
		return "Placed · calendar invite queued. Delivery status appears in Comms.";
	}
	if (result.calendarInviteStatus === "not_applicable") {
		return "Placed · no calendar invite queued because this submission has no submitter email.";
	}
	if (result.email?.ok && result.email.status === "sent") {
		return "Placed · calendar invite emailed to speaker(s).";
	}
	if (result.email?.ok && result.email.status === "skipped") {
		return "Placed · calendar invite skipped (demo or mail disabled).";
	}
	if (result.email && !result.email.ok) {
		return `Placed · calendar invite failed: ${result.email.error ?? "send error"}. Session is still on the grid.`;
	}
	if ((result.icsBytesLength ?? 0) > 0) {
		return "Placed · calendar invite prepared.";
	}
	return "Placed on the grid. Publish when you want it public.";
}
