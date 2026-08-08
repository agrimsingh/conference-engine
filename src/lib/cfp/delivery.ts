/**
 * Materializing a submission and sending its follow-up messages are separate
 * operations. Run this after every finalize attempt: the mail layer records
 * successful one-shot deliveries, while failed co-speaker invites remain
 * eligible for repair on a replay.
 */
export async function repairSubmissionDelivery(args: {
	notify: () => Promise<unknown>;
	inviteCoSpeakers: () => Promise<unknown>;
}): Promise<void> {
	await Promise.all([args.notify(), args.inviteCoSpeakers()]);
}

export function shouldSendPendingCoSpeakerInvite(hasSuccessfulDelivery: boolean): boolean {
	return !hasSuccessfulDelivery;
}
