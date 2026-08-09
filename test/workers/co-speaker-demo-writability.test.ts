import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import {
	confirmCoSpeaker,
	declineCoSpeaker,
	getSpeakerByConfirmToken,
	hashConfirmToken,
} from "@/lib/speakers/co-speakers";

const now = 1_780_400_000_000;

async function seedSpeakerFixture(args: {
	eventId: string;
	mode: "demo" | "live";
	formId: string;
	submissionId: string;
	speakerId: string;
	token: string;
}): Promise<void> {
	await env.DB.batch([
		env.DB.prepare("INSERT INTO events (id, slug, name, timezone, mode, created_at, updated_at) VALUES (?, ?, ?, 'UTC', ?, ?, ?)").bind(args.eventId, args.eventId, args.eventId, args.mode, now, now),
		env.DB.prepare("INSERT INTO cfp_forms (id, event_id, slug, title, status, created_at, updated_at) VALUES (?, ?, 'cfp', 'CFP', 'open', ?, ?)").bind(args.formId, args.eventId, now, now),
		env.DB.prepare("INSERT INTO submissions (id, form_id, event_id, status, answers_json, created_at, updated_at) VALUES (?, ?, ?, 'submitted', '{}', ?, ?)").bind(args.submissionId, args.formId, args.eventId, now, now),
		env.DB.prepare("INSERT INTO submission_speakers (id, submission_id, name, email, position, status, confirm_token_hash) VALUES (?, ?, 'Co Speaker', ?, 1, 'pending', ?)").bind(args.speakerId, args.submissionId, `${args.speakerId}@example.test`, await hashConfirmToken(args.token)),
	]);
}

describe("tokenized co-speaker demo writability", () => {
	it("denies confirm and decline after token resolution without changing demo D1", async () => {
		await seedSpeakerFixture({ eventId: "co-token-demo-event", mode: "demo", formId: "co-token-demo-form", submissionId: "co-token-demo-submission", speakerId: "co-token-demo-confirm", token: "demo-confirm-token" });
		await seedSpeakerFixture({ eventId: "co-token-demo-event-two", mode: "demo", formId: "co-token-demo-form-two", submissionId: "co-token-demo-submission-two", speakerId: "co-token-demo-decline", token: "demo-decline-token" });
		const confirmSpeaker = await getSpeakerByConfirmToken(env.DB, "demo-confirm-token");
		const declineSpeaker = await getSpeakerByConfirmToken(env.DB, "demo-decline-token");
		expect(confirmSpeaker?.id).toBe("co-token-demo-confirm");
		expect(declineSpeaker?.id).toBe("co-token-demo-decline");
		const before = await env.DB.prepare("SELECT id, status, confirmed_at FROM submission_speakers WHERE id IN ('co-token-demo-confirm', 'co-token-demo-decline') ORDER BY id").all();
		expect(await confirmCoSpeaker(env.DB, confirmSpeaker!.id)).toMatchObject({ ok: false, status: 403 });
		expect(await declineCoSpeaker(env.DB, declineSpeaker!.id)).toMatchObject({ ok: false, status: 403 });
		const after = await env.DB.prepare("SELECT id, status, confirmed_at FROM submission_speakers WHERE id IN ('co-token-demo-confirm', 'co-token-demo-decline') ORDER BY id").all();
		expect(after.results).toEqual(before.results);
	});

	it("keeps live tokenized confirmation and decline flows successful", async () => {
		await seedSpeakerFixture({ eventId: "co-token-live-event", mode: "live", formId: "co-token-live-form", submissionId: "co-token-live-submission", speakerId: "co-token-live-confirm", token: "live-confirm-token" });
		await seedSpeakerFixture({ eventId: "co-token-live-event-two", mode: "live", formId: "co-token-live-form-two", submissionId: "co-token-live-submission-two", speakerId: "co-token-live-decline", token: "live-decline-token" });
		const confirmSpeaker = await getSpeakerByConfirmToken(env.DB, "live-confirm-token");
		const declineSpeaker = await getSpeakerByConfirmToken(env.DB, "live-decline-token");
		expect((await confirmCoSpeaker(env.DB, confirmSpeaker!.id)).ok).toBe(true);
		expect((await declineCoSpeaker(env.DB, declineSpeaker!.id)).ok).toBe(true);
		expect(await env.DB.prepare("SELECT status FROM submission_speakers WHERE id = 'co-token-live-confirm'").first()).toEqual({ status: "confirmed" });
		expect(await env.DB.prepare("SELECT status FROM submission_speakers WHERE id = 'co-token-live-decline'").first()).toEqual({ status: "declined" });
	});
});
