import { describe, expect, it } from "vitest";
import { repairSubmissionDelivery, shouldSendPendingCoSpeakerInvite } from "./delivery";

describe("finalized submission delivery repair", () => {
	it("replays missed side effects without sending already-successful mail again", async () => {
		let confirmationDeliveries = 0;
		let inviteDeliveries = 0;
		let confirmationSent = false;
		let failInviteOnce = true;
		const notify = async () => {
			if (confirmationSent) return;
			confirmationSent = true;
			confirmationDeliveries += 1;
		};
		const inviteCoSpeakers = async () => {
			if (!shouldSendPendingCoSpeakerInvite(inviteDeliveries > 0)) return;
			if (failInviteOnce) {
				failInviteOnce = false;
				throw new Error("provider unavailable");
			}
			inviteDeliveries += 1;
		};

		await expect(repairSubmissionDelivery({ notify, inviteCoSpeakers })).rejects.toThrow("provider unavailable");
		await repairSubmissionDelivery({ notify, inviteCoSpeakers });

		expect(confirmationDeliveries).toBe(1);
		expect(inviteDeliveries).toBe(1);
	});
});
