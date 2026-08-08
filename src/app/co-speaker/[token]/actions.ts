"use server";

import { getDb } from "@/lib/db/cloudflare";
import {
	confirmCoSpeaker,
	declineCoSpeaker,
	getSpeakerByConfirmToken,
} from "@/lib/speakers/co-speakers";

export type RespondActionResult =
	| { ok: true; status: "confirmed" | "declined" }
	| { ok: false; error: string };

export async function respondToCoSpeakerInvite(
	token: string,
	response: "confirm" | "decline",
): Promise<RespondActionResult> {
	const db = await getDb();
	const speaker = await getSpeakerByConfirmToken(db, token);
	if (!speaker) {
		return { ok: false, error: "This link is no longer valid. Ask the organizers to resend your invite." };
	}

	const result =
		response === "confirm"
			? await confirmCoSpeaker(db, speaker.id)
			: await declineCoSpeaker(db, speaker.id);

	if (!result.ok) {
		return { ok: false, error: result.error };
	}
	return {
		ok: true,
		status: response === "confirm" ? "confirmed" : "declined",
	};
}
