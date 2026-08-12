"use server";

import { getDb } from "@/lib/db/cloudflare";
import {
	acceptSpeakerHandoff,
	declineSpeakerHandoff,
	getHandoffByToken,
} from "@/lib/speakers/handoff";

export type HandoffRespondResult =
	| { ok: true; status: "accepted" | "declined" }
	| { ok: false; error: string };

export async function respondToSpeakerHandoff(
	token: string,
	response: "accept" | "decline",
): Promise<HandoffRespondResult> {
	const db = await getDb();
	const handoff = await getHandoffByToken(db, token);
	if (!handoff) {
		return { ok: false, error: "This link is no longer valid. Ask the speaker to send it again." };
	}
	const result =
		response === "accept"
			? await acceptSpeakerHandoff(db, handoff.id)
			: await declineSpeakerHandoff(db, handoff.id);
	if (!result.ok) return { ok: false, error: result.error };
	return { ok: true, status: response === "accept" ? "accepted" : "declined" };
}
