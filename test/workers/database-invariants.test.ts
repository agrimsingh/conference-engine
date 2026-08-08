import { env } from "cloudflare:workers";
import { describe, expect, it, vi } from "vitest";
import { createVerifiedDraft, finalizeDraft, issueDraftResumeToken } from "@/lib/cfp/drafts";
import { consumeFixedWindowRateLimit } from "@/lib/security/rate-limit";
import { completeFileTask } from "@/lib/speakers/complete-task";
import { inviteCoSpeaker, sendPendingInvitesForSubmission } from "@/lib/speakers/co-speakers";
import { createAuthChallenge, consumeAuthChallenge } from "@/lib/auth/challenges";
import { acceptEventInvitation } from "@/lib/events/invite-member";
import {
	markEmailDeliveryAccepted,
	markEmailDeliveryFailed,
	reserveEmailDelivery,
} from "@/lib/email/resend";
import { sendTaskReminders } from "@/lib/email/reminders";

const now = 1_780_000_000_000;

async function seedEvent(eventId: string, slug: string): Promise<void> {
	await env.DB.prepare(
		"INSERT INTO events (id, slug, name, timezone, created_at, updated_at) VALUES (?, ?, ?, 'UTC', ?, ?)",
	).bind(eventId, slug, `${slug} conference`, now, now).run();
}

async function seedForm(eventId: string, formId: string, slug: string, submissionLimit = 0): Promise<void> {
	await env.DB.prepare(
		`INSERT INTO cfp_forms (id, event_id, slug, title, status, created_at, updated_at, submission_limit)
		 VALUES (?, ?, ?, 'CFP', 'open', ?, ?, ?)`,
	).bind(formId, eventId, slug, now, now, submissionLimit).run();
}

describe("D1 runtime invariants", () => {
	it("loads only the explicit test secret binding", () => {
		const bindings = env as unknown as Record<string, unknown>;
		expect(bindings.AUTH_SECRET).toBe("worker-test-auth-secret");
		for (const name of ["RESEND_API_KEY", "AIRTABLE_API_KEY", "PUBLIC_API_KEY"]) {
			expect(bindings[name]).toBeUndefined();
		}
	});

	it("applies the production migrations, makes ownership canonical, and fails preflight closed", async () => {
		expect((await env.DB.prepare("SELECT COUNT(*) AS count FROM d1_migrations").first<{ count: number }>())?.count).toBe(14);
		await seedEvent("ownership-event", "ownership-event");
		await env.DB.prepare(
			"INSERT INTO accounts (id, email, name, created_at, updated_at) VALUES ('owner-account', 'owner@example.test', 'Owner', ?, ?)",
		).bind(now, now).run();
		await env.DB.prepare(
			"INSERT INTO event_memberships (id, event_id, account_id, role, created_at) VALUES ('owner-membership', 'ownership-event', 'owner-account', 'admin', ?)",
		).bind(now).run();
		await env.DB.prepare(
			"INSERT INTO event_ownership (event_id, account_id, created_at, updated_at) VALUES ('ownership-event', 'owner-account', ?, ?)",
		).bind(now, now).run();

		await expect(env.DB.prepare(
			"INSERT INTO event_memberships (id, event_id, account_id, role, created_at) VALUES ('illegal-owner', 'ownership-event', 'owner-account', 'owner', ?)",
		).bind(now).run()).rejects.toThrow(/ownership is stored/i);
		await expect(env.DB.prepare(
			"INSERT INTO event_ownership (event_id, account_id, created_at, updated_at) VALUES ('ownership-event', 'owner-account', ?, ?)",
		).bind(now, now).run()).rejects.toThrow();

		await seedEvent("preflight-event", "preflight-event");
		const preflightSql = (env as typeof env & { TEST_PREFLIGHT_SQL: string }).TEST_PREFLIGHT_SQL;
		await expect(env.DB.prepare(preflightSql).run()).rejects.toThrow(/CHECK constraint failed/i);
	});

	it("atomically enforces a fixed-window rate limit under concurrent requests", async () => {
		const attempts = await Promise.all(Array.from({ length: 20 }, () => consumeFixedWindowRateLimit(env.DB, {
			secret: "rate-limit-test-secret",
			bucket: "worker-test",
			subject: "same-principal",
			limit: 5,
			windowMs: 60_000,
			now,
		})));
		expect(attempts.filter(Boolean)).toHaveLength(5);
		const bucket = await env.DB.prepare("SELECT count FROM rate_limit_buckets WHERE bucket = 'worker-test'").first<{ count: number }>();
		expect(bucket?.count).toBe(5);
	});

	it("reserves exactly one durable email send and recovers a provider-success finalization gap", async () => {
		await seedEvent("email-event", "email-event");
		const reservation = () => reserveEmailDelivery(env.DB, {
			deliveryKey: "delivery-key-1",
			eventId: "email-event",
			submissionId: null,
			templateKey: "task_reminder",
			toEmail: "speaker@email.test",
			subject: "Reminder",
			now,
		});
		const attempts = await Promise.all(Array.from({ length: 16 }, reservation));
		expect(attempts.filter((attempt) => attempt.action === "send")).toHaveLength(1);
		expect(attempts.filter((attempt) => attempt.action === "in_flight")).toHaveLength(15);
		await markEmailDeliveryAccepted(env.DB, { deliveryKey: "delivery-key-1", providerId: "resend-123", now });
		const recovered = await reservation();
		expect(recovered).toEqual({ action: "sent", providerId: "resend-123" });

		const retryKey = "delivery-key-retry";
		expect((await reserveEmailDelivery(env.DB, {
			deliveryKey: retryKey, eventId: "email-event", submissionId: null, templateKey: "task_reminder", toEmail: "speaker@email.test", subject: "Reminder", now,
		})).action).toBe("send");
		await markEmailDeliveryFailed(env.DB, { deliveryKey: retryKey, error: "temporary provider failure", now });
		expect((await reserveEmailDelivery(env.DB, {
			deliveryKey: retryKey, eventId: "email-event", submissionId: null, templateKey: "task_reminder", toEmail: "speaker@email.test", subject: "Reminder", now: now + 1,
		})).action).toBe("send");
		const retry = await env.DB.prepare("SELECT delivery_key, attempt_count FROM email_deliveries WHERE delivery_key = ?").bind(retryKey).first<{ delivery_key: string; attempt_count: number }>();
		expect(retry).toEqual({ delivery_key: retryKey, attempt_count: 2 });

		const row = await env.DB.prepare("SELECT delivery_key, status, attempt_count FROM email_deliveries WHERE delivery_key = ?").bind("delivery-key-1").first<{ delivery_key: string; status: string; attempt_count: number }>();
		expect(row).toEqual({ delivery_key: "delivery-key-1", status: "sent", attempt_count: 1 });
	});

	it("dedupes concurrent reminder runs in a deliberate delivery window", async () => {
		await seedEvent("reminder-event", "reminder-event");
		await seedForm("reminder-event", "reminder-form", "reminder-form");
		await env.DB.batch([
			env.DB.prepare("INSERT INTO people (id, email, name, created_at) VALUES ('reminder-person', 'speaker@reminder.test', 'Speaker', ?)").bind(now),
			env.DB.prepare("INSERT INTO submissions (id, form_id, event_id, status, answers_json, created_at, updated_at) VALUES ('reminder-submission', 'reminder-form', 'reminder-event', 'accepted', '{}', ?, ?)").bind(now, now),
			env.DB.prepare("INSERT INTO speaker_tasks (id, event_id, submission_id, person_id, template_key, status, created_at, updated_at) VALUES ('reminder-task', 'reminder-event', 'reminder-submission', 'reminder-person', 'bio', 'pending', ?, ?)").bind(now, now),
		]);
		const fetchMock = vi.fn(async () => new Response(JSON.stringify({ id: "provider-reminder" }), { status: 200 }));
		vi.stubGlobal("fetch", fetchMock);
		try {
			const runtime = env as unknown as {
				DB: D1Database; SESSIONS: KVNamespace; AUTH_SECRET: string;
			};
			const reminderEnv = {
				...runtime,
				RESEND_API_KEY: "test-resend-key",
				RESEND_FROM_EMAIL: "team@example.test",
				APP_ORIGIN: "https://conference.example.test",
			};
			const runs = await Promise.all([
				sendTaskReminders(reminderEnv, { now }),
				sendTaskReminders(reminderEnv, { now }),
			]);
			expect(runs.reduce((count, run) => count + run.sent, 0)).toBe(1);
			expect(runs.reduce((count, run) => count + run.skipped, 0)).toBe(1);
			expect(fetchMock).toHaveBeenCalledTimes(1);
			const delivery = await env.DB.prepare("SELECT status, attempt_count FROM email_deliveries WHERE event_id = 'reminder-event'").first<{ status: string; attempt_count: number }>();
			expect(delivery).toEqual({ status: "sent", attempt_count: 1 });
		} finally {
			vi.unstubAllGlobals();
		}
	});

	it("keeps co-speaker links stable across concurrent repair and ambiguous provider finalization", async () => {
		await seedEvent("co-event", "co-event");
		await seedForm("co-event", "co-form", "co-form");
		await env.DB.batch([
			env.DB.prepare("INSERT INTO submissions (id, form_id, event_id, status, answers_json, created_at, updated_at) VALUES ('co-submission', 'co-form', 'co-event', 'submitted', ?, ?, ?)").bind('{"title":"Stable links"}', now, now),
			env.DB.prepare("INSERT INTO submission_speakers (id, submission_id, name, email, position, status) VALUES ('co-speaker', 'co-submission', 'Co Speaker', 'co@example.test', 1, 'pending')"),
			env.DB.prepare("CREATE TRIGGER fail_provider_acceptance BEFORE UPDATE ON email_deliveries WHEN NEW.status = 'provider_accepted' BEGIN SELECT RAISE(ABORT, 'finalization gap'); END"),
		]);
		const fetchMock = vi.fn(async () => new Response(JSON.stringify({ id: "co-provider" }), { status: 200 }));
		vi.stubGlobal("fetch", fetchMock);
		try {
			const runtime = { authSecret: "co-speaker-secret", resendApiKey: "test-key", resendFromEmail: "team@example.test" };
			const attempts = await Promise.all(Array.from({ length: 8 }, () => inviteCoSpeaker(env.DB, {
				speakerId: "co-speaker", origin: "https://conference.example.test", runtime,
			})));
			expect(attempts.every((attempt) => attempt.ok)).toBe(true);
			const urls = attempts.filter((attempt): attempt is Extract<typeof attempt, { ok: true }> => attempt.ok).map((attempt) => attempt.confirmUrl);
			expect(new Set(urls).size).toBe(1);
			expect(fetchMock).toHaveBeenCalledTimes(1);
			const replay = await inviteCoSpeaker(env.DB, { speakerId: "co-speaker", origin: "https://conference.example.test", runtime });
			expect(replay.ok && replay.confirmUrl).toBe(urls[0]);
			expect(fetchMock).toHaveBeenCalledTimes(1);
			expect(await env.DB.prepare("SELECT status FROM email_deliveries WHERE event_id = 'co-event'").first<{ status: string }>()).toEqual({ status: "sending" });
		} finally {
			vi.unstubAllGlobals();
			await env.DB.prepare("DROP TRIGGER fail_provider_acceptance").run();
		}
	});

	it("rotates a co-speaker link only after a confirmed provider rejection", async () => {
		await seedEvent("co-failure-event", "co-failure-event");
		await seedForm("co-failure-event", "co-failure-form", "co-failure-form");
		await env.DB.batch([
			env.DB.prepare("INSERT INTO submissions (id, form_id, event_id, status, answers_json, created_at, updated_at) VALUES ('co-failure-submission', 'co-failure-form', 'co-failure-event', 'submitted', '{}', ?, ?)").bind(now, now),
			env.DB.prepare("INSERT INTO submission_speakers (id, submission_id, name, email, position, status) VALUES ('co-failure-speaker', 'co-failure-submission', 'Co Speaker', 'co-failure@example.test', 1, 'pending')"),
		]);
		const fetchMock = vi.fn()
			.mockResolvedValueOnce(new Response(JSON.stringify({ message: "rejected" }), { status: 400 }))
			.mockResolvedValueOnce(new Response(JSON.stringify({ id: "co-provider-retry" }), { status: 200 }));
		vi.stubGlobal("fetch", fetchMock);
		try {
			const runtime = { authSecret: "co-failure-secret", resendApiKey: "test-key" };
			const first = await inviteCoSpeaker(env.DB, { speakerId: "co-failure-speaker", origin: "https://conference.example.test", runtime });
			const second = await inviteCoSpeaker(env.DB, { speakerId: "co-failure-speaker", origin: "https://conference.example.test", runtime });
			expect(first.ok && second.ok && first.confirmUrl).not.toBe(second.ok ? second.confirmUrl : "");
			expect(fetchMock).toHaveBeenCalledTimes(2);
			expect(await env.DB.prepare("SELECT generation FROM co_speaker_invitation_claims WHERE speaker_id = 'co-failure-speaker'").first<{ generation: number }>()).toEqual({ generation: 2 });
		} finally {
			vi.unstubAllGlobals();
		}
	});

	it("rotates a delivered co-speaker link only for an explicit organizer resend", async () => {
		await seedEvent("co-resend-event", "co-resend-event");
		await seedForm("co-resend-event", "co-resend-form", "co-resend-form");
		await env.DB.batch([
			env.DB.prepare("INSERT INTO submissions (id, form_id, event_id, status, answers_json, created_at, updated_at) VALUES ('co-resend-submission', 'co-resend-form', 'co-resend-event', 'submitted', '{}', ?, ?)").bind(now, now),
			env.DB.prepare("INSERT INTO submission_speakers (id, submission_id, name, email, position, status) VALUES ('co-resend-speaker', 'co-resend-submission', 'Co Speaker', 'co-resend@example.test', 1, 'pending')"),
		]);
		const fetchMock = vi.fn(async () => new Response(JSON.stringify({ id: "co-provider" }), { status: 200 }));
		vi.stubGlobal("fetch", fetchMock);
		try {
			const runtime = { authSecret: "co-resend-secret", resendApiKey: "test-key" };
			const first = await inviteCoSpeaker(env.DB, { speakerId: "co-resend-speaker", origin: "https://conference.example.test", runtime, mode: "initial" });
			const repair = await inviteCoSpeaker(env.DB, { speakerId: "co-resend-speaker", origin: "https://conference.example.test", runtime, mode: "repair" });
			expect(first.ok && first.email.status).toBe("sent");
			expect(await env.DB.prepare("SELECT status FROM email_deliveries WHERE event_id = 'co-resend-event'").first<{ status: string }>()).toEqual({ status: "sent" });
			const resend = await inviteCoSpeaker(env.DB, { speakerId: "co-resend-speaker", origin: "https://conference.example.test", runtime, mode: "resend" });
			expect(first.ok && repair.ok && first.confirmUrl).toBe(repair.ok ? repair.confirmUrl : "");
			expect(first.ok && resend.ok && first.confirmUrl).not.toBe(resend.ok ? resend.confirmUrl : "");
			expect(fetchMock).toHaveBeenCalledTimes(2);
			expect(await env.DB.prepare("SELECT generation, status FROM co_speaker_invitation_claims c JOIN email_deliveries d ON d.delivery_key = c.delivery_key WHERE c.speaker_id = 'co-resend-speaker'").first<{ generation: number; status: string }>()).toEqual({ generation: 2, status: "sent" });
		} finally {
			vi.unstubAllGlobals();
		}
	});

	it("preserves a pre-0014 pending invitation during automatic repair", async () => {
		await seedEvent("legacy-co-event", "legacy-co-event");
		await seedForm("legacy-co-event", "legacy-co-form", "legacy-co-form");
		await env.DB.batch([
			env.DB.prepare("INSERT INTO submissions (id, form_id, event_id, status, answers_json, created_at, updated_at) VALUES ('legacy-co-submission', 'legacy-co-form', 'legacy-co-event', 'submitted', '{}', ?, ?)").bind(now, now),
			env.DB.prepare("INSERT INTO submission_speakers (id, submission_id, name, email, position, status, confirm_token_hash, invited_at) VALUES ('legacy-co-speaker', 'legacy-co-submission', 'Legacy Speaker', 'legacy@example.test', 1, 'pending', 'legacy-token-hash', ?)").bind(now),
		]);
		const fetchMock = vi.fn(async () => new Response(JSON.stringify({ id: "unexpected" }), { status: 200 }));
		vi.stubGlobal("fetch", fetchMock);
		try {
			await expect(sendPendingInvitesForSubmission(env.DB, { submissionId: "legacy-co-submission", origin: "https://conference.example.test" })).resolves.toEqual([]);
			expect(fetchMock).not.toHaveBeenCalled();
			expect(await env.DB.prepare("SELECT confirm_token_hash FROM submission_speakers WHERE id = 'legacy-co-speaker'").first<{ confirm_token_hash: string }>()).toEqual({ confirm_token_hash: "legacy-token-hash" });
			expect(await env.DB.prepare("SELECT COUNT(*) AS count FROM co_speaker_invitation_claims WHERE speaker_id = 'legacy-co-speaker'").first<{ count: number }>()).toEqual({ count: 0 });
		} finally {
			vi.unstubAllGlobals();
		}
	});

	it("consumes D1 auth challenges once and transfers ownership only on accepted owner invite", async () => {
		await seedEvent("invite-event", "invite-event");
		await env.DB.batch([
			env.DB.prepare("INSERT INTO accounts (id, email, name, created_at, updated_at) VALUES ('invite-owner', 'owner@invite.test', 'Owner', ?, ?)").bind(now, now),
			env.DB.prepare("INSERT INTO accounts (id, email, name, created_at, updated_at) VALUES ('invite-target', 'target@invite.test', 'Target', ?, ?)").bind(now, now),
			env.DB.prepare("INSERT INTO accounts (id, email, name, created_at, updated_at) VALUES ('invite-stale', 'stale@invite.test', 'Stale', ?, ?)").bind(now, now),
			env.DB.prepare("INSERT INTO event_memberships (id, event_id, account_id, role, created_at) VALUES ('invite-owner-member', 'invite-event', 'invite-owner', 'admin', ?)").bind(now),
			env.DB.prepare("INSERT INTO event_ownership (event_id, account_id, created_at, updated_at) VALUES ('invite-event', 'invite-owner', ?, ?)").bind(now, now),
		]);
		const challenge = await createAuthChallenge(env.DB, { secret: "invite-secret", kind: "event_invite", accountId: "invite-target", eventId: "invite-event", token: "invite-raw-token", now });
		const staleChallenge = await createAuthChallenge(env.DB, { secret: "invite-secret", kind: "event_invite", accountId: "invite-stale", eventId: "invite-event", token: "stale-raw-token", now });
		await env.DB.prepare(
			`INSERT INTO event_invitations (id, event_id, account_id, email, name, role, token_hash, status, invited_by_account_id, created_at, updated_at, delivered_at)
		VALUES ('owner-invite', 'invite-event', 'invite-target', 'target@invite.test', 'Target', 'owner', ?, 'delivered', 'invite-owner', ?, ?, ?),
		       ('stale-owner-invite', 'invite-event', 'invite-stale', 'stale@invite.test', 'Stale', 'owner', ?, 'delivered', 'invite-owner', ?, ?, ?)`,
		).bind(challenge.tokenHash, now, now, now, staleChallenge.tokenHash, now, now, now).run();
		const accepts = await Promise.all([
			acceptEventInvitation(env.DB, { secret: "invite-secret", token: "invite-raw-token", now }),
			acceptEventInvitation(env.DB, { secret: "invite-secret", token: "invite-raw-token", now }),
		]);
		expect(accepts.filter(Boolean)).toHaveLength(1);
		expect((await env.DB.prepare("SELECT account_id FROM event_ownership WHERE event_id = 'invite-event'").first<{ account_id: string }>())?.account_id).toBe("invite-target");
		expect((await env.DB.prepare("SELECT COUNT(*) AS count FROM event_memberships WHERE event_id = 'invite-event' AND account_id = 'invite-target'").first<{ count: number }>())?.count).toBe(1);
		expect(await acceptEventInvitation(env.DB, { secret: "invite-secret", token: "invite-raw-token", now })).toBeNull();
		expect(await acceptEventInvitation(env.DB, { secret: "invite-secret", token: "stale-raw-token", now: now + 1 })).toBeNull();
		expect((await env.DB.prepare("SELECT account_id FROM event_ownership WHERE event_id = 'invite-event'").first<{ account_id: string }>())?.account_id).toBe("invite-target");
		expect((await env.DB.prepare("SELECT status FROM event_invitations WHERE id = 'stale-owner-invite'").first<{ status: string }>())?.status).toBe("failed");

		const loginChallenge = await createAuthChallenge(env.DB, { secret: "invite-secret", kind: "organizer_login", accountId: "invite-target", token: "login-raw-token", now });
		const consumed = await Promise.all([
			consumeAuthChallenge(env.DB, { secret: "invite-secret", token: loginChallenge.token, kind: "organizer_login", now }),
			consumeAuthChallenge(env.DB, { secret: "invite-secret", token: loginChallenge.token, kind: "organizer_login", now }),
		]);
		expect(consumed.filter(Boolean)).toHaveLength(1);

		await env.DB.prepare("INSERT INTO accounts (id, email, name, created_at, updated_at) VALUES ('invite-admin-target', 'admin-target@invite.test', 'Admin target', ?, ?)").bind(now, now).run();
		const removedAdminChallenge = await createAuthChallenge(env.DB, { secret: "invite-secret", kind: "event_invite", accountId: "invite-admin-target", eventId: "invite-event", token: "removed-admin-token", now });
		await env.DB.prepare(
			"INSERT INTO event_invitations (id, event_id, account_id, email, name, role, token_hash, status, invited_by_account_id, created_at, updated_at, delivered_at) VALUES ('removed-admin-invite', 'invite-event', 'invite-admin-target', 'admin-target@invite.test', 'Admin target', 'admin', ?, 'delivered', 'invite-target', ?, ?, ?)",
		).bind(removedAdminChallenge.tokenHash, now, now, now).run();
		await env.DB.batch([
			env.DB.prepare("DELETE FROM event_ownership WHERE event_id = 'invite-event'"),
			env.DB.prepare("DELETE FROM event_memberships WHERE event_id = 'invite-event' AND account_id = 'invite-target'"),
		]);
		expect(await acceptEventInvitation(env.DB, { secret: "invite-secret", token: "removed-admin-token", now: now + 2 })).toBeNull();
		expect(await env.DB.prepare("SELECT status FROM event_invitations WHERE id = 'removed-admin-invite'").first<{ status: string }>()).toEqual({ status: "failed" });
		expect(await env.DB.prepare("SELECT state FROM auth_challenges WHERE token_hash = ?").bind(removedAdminChallenge.tokenHash).first<{ state: string }>()).toEqual({ state: "failed" });
	});

	it("allows only one concurrent draft finalization when the form limit is one", async () => {
		await seedEvent("draft-event", "draft-event");
		await seedForm("draft-event", "draft-form", "draft-form", 1);
		const drafts = await Promise.all(["one", "two"].map(async (suffix) => {
			const draftId = await createVerifiedDraft(env.DB, {
				id: `draft-${suffix}`,
				eventId: "draft-event",
				formId: "draft-form",
				verifiedEmail: `${suffix}@speaker.test`,
			});
			return {
				draftId,
				token: await issueDraftResumeToken(env.DB, { secret: "draft-test-secret", draftId, deliveryVerified: true, token: `resume-${suffix}`, now }),
			};
		}));

		const results = await Promise.allSettled(drafts.map(({ draftId, token }, index) => finalizeDraft(env.DB, {
			secret: "draft-test-secret",
			draftId,
			token,
			submitterName: `Speaker ${index + 1}`,
			answers: { title: `Talk ${index + 1}` },
			speakers: [{ name: `Speaker ${index + 1}`, email: `${index === 0 ? "one" : "two"}@speaker.test` }],
			now,
		})));
		const fulfilled = results.filter((result): result is PromiseFulfilledResult<{ submissionId: string; replay: boolean }> => result.status === "fulfilled");
		const rejected = results.filter((result): result is PromiseRejectedResult => result.status === "rejected");
		expect(fulfilled).toHaveLength(1);
		expect(rejected).toHaveLength(1);
		expect(String(rejected[0].reason)).toMatch(/submission limit reached/i);
		expect((await env.DB.prepare("SELECT COUNT(*) AS count FROM submissions WHERE form_id = 'draft-form'").first<{ count: number }>())?.count).toBe(1);

		await expect(finalizeDraft(env.DB, {
			secret: "draft-test-secret",
			draftId: fulfilled[0].value.submissionId,
			token: drafts.find(({ draftId }) => draftId === fulfilled[0].value.submissionId)?.token ?? "",
			submitterName: "Replay speaker",
			answers: {},
			speakers: [],
			now,
		})).resolves.toEqual({ submissionId: fulfilled[0].value.submissionId, replay: true });
	});

	it("compensates a failed D1 file completion without deleting an older R2 object", async () => {
		await seedEvent("upload-event", "upload-event");
		await seedForm("upload-event", "upload-form", "upload-form");
		await env.DB.batch([
			env.DB.prepare("INSERT INTO people (id, email, name, created_at) VALUES ('upload-person', 'speaker@upload.test', 'Speaker', ?)").bind(now),
			env.DB.prepare("INSERT INTO submissions (id, form_id, event_id, status, answers_json, created_at, updated_at) VALUES ('upload-submission', 'upload-form', 'upload-event', 'accepted', '{}', ?, ?)").bind(now, now),
			env.DB.prepare("INSERT INTO speaker_profiles (id, event_id, person_id, created_at, updated_at) VALUES ('upload-profile', 'upload-event', 'upload-person', ?, ?)").bind(now, now),
			env.DB.prepare("INSERT INTO speaker_tasks (id, event_id, submission_id, person_id, template_key, status, created_at, updated_at) VALUES ('upload-task', 'upload-event', 'upload-submission', 'upload-person', 'headshot', 'pending', ?, ?)").bind(now, now),
			env.DB.prepare("CREATE TRIGGER fail_worker_test_asset BEFORE INSERT ON assets BEGIN SELECT RAISE(ABORT, 'worker test database failure'); END"),
		]);
		const uploadPrefix = "events/upload-event/people/upload-person/headshot/";
		const priorObjectKey = `${uploadPrefix}prior-object.png`;
		await env.FILES.put(priorObjectKey, "keep-me");

		await expect(completeFileTask(env.DB, env.FILES, {
			taskId: "upload-task",
			personId: "upload-person",
			file: new File(["image-bytes"], "headshot.png", { type: "image/png" }),
		})).rejects.toThrow(/worker test database failure/i);

		expect(await (await env.FILES.get(priorObjectKey))?.text()).toBe("keep-me");
		const uploaded = await env.FILES.list({ prefix: uploadPrefix });
		expect(uploaded.objects.map((object) => object.key)).toEqual([priorObjectKey]);
		await env.DB.prepare("DROP TRIGGER fail_worker_test_asset").run();
	});

	it("keeps one replacement upload and removes the losing R2 object", async () => {
		await seedEvent("upload-race-event", "upload-race-event");
		await seedForm("upload-race-event", "upload-race-form", "upload-race-form");
		await env.DB.batch([
			env.DB.prepare("INSERT INTO people (id, email, name, created_at) VALUES ('upload-race-person', 'speaker@upload-race.test', 'Speaker', ?)").bind(now),
			env.DB.prepare("INSERT INTO submissions (id, form_id, event_id, status, answers_json, created_at, updated_at) VALUES ('upload-race-submission', 'upload-race-form', 'upload-race-event', 'accepted', '{}', ?, ?)").bind(now, now),
			env.DB.prepare("INSERT INTO assets (id, event_id, r2_key, content_type, filename, uploaded_by_person_id, created_at) VALUES ('upload-race-old', 'upload-race-event', 'events/upload-race-event/people/upload-race-person/headshot/old.png', 'image/png', 'old.png', 'upload-race-person', ?)").bind(now),
			env.DB.prepare("INSERT INTO speaker_profiles (id, event_id, person_id, headshot_asset_id, created_at, updated_at) VALUES ('upload-race-profile', 'upload-race-event', 'upload-race-person', 'upload-race-old', ?, ?)").bind(now, now),
			env.DB.prepare("INSERT INTO speaker_tasks (id, event_id, submission_id, person_id, template_key, status, asset_id, created_at, updated_at) VALUES ('upload-race-task', 'upload-race-event', 'upload-race-submission', 'upload-race-person', 'headshot', 'pending', 'upload-race-old', ?, ?)").bind(now, now),
		]);
		await env.FILES.put("events/upload-race-event/people/upload-race-person/headshot/old.png", "old");
		const results = await Promise.all([
			completeFileTask(env.DB, env.FILES, { taskId: "upload-race-task", personId: "upload-race-person", file: new File(["one"], "one.png", { type: "image/png" }) }),
			completeFileTask(env.DB, env.FILES, { taskId: "upload-race-task", personId: "upload-race-person", file: new File(["two"], "two.png", { type: "image/png" }) }),
		]);
		expect(results.filter((result) => result.ok)).toHaveLength(1);
		expect(results.filter((result) => !result.ok && result.status === 409)).toHaveLength(1);
		expect(await env.DB.prepare("SELECT COUNT(*) AS count FROM assets WHERE event_id = 'upload-race-event'").first<{ count: number }>()).toEqual({ count: 1 });
		const objects = await env.FILES.list({ prefix: "events/upload-race-event/people/upload-race-person/headshot/" });
		expect(objects.objects).toHaveLength(1);
	});
});
