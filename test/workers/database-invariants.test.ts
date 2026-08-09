import { env } from "cloudflare:workers";
import { describe, expect, it, vi } from "vitest";
import { createVerifiedDraft, finalizeDraft, issueDraftResumeToken } from "@/lib/cfp/drafts";
import { consumeFixedWindowRateLimit, pruneExpiredRateLimitBuckets } from "@/lib/security/rate-limit";
import { completeFileTask } from "@/lib/speakers/complete-task";
import { addCoSpeaker, getSpeakerByConfirmToken, inviteCoSpeaker, removeCoSpeaker, sendPendingInvitesForSubmission } from "@/lib/speakers/co-speakers";
import { createAuthChallenge, consumeAuthChallenge } from "@/lib/auth/challenges";
import { failOneTimeLinkChallengeIfConfirmed } from "@/lib/auth/email-delivery";
import { acceptEventInvitation, inviteOrganizerToEvent } from "@/lib/events/invite-member";
import {
	markEmailDeliveryAccepted,
	markEmailDeliveryFailed,
	reserveEmailDelivery,
} from "@/lib/email/resend";
import { sendTaskReminders } from "@/lib/email/reminders";
import { reorderFormFields, softDeleteFormField, updateFormField } from "@/lib/cfp/form-admin";
import { upsertAccountByEmail } from "@/lib/db/queries";

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

	it("cannot mutate or reorder a field outside the route's form", async () => {
		await seedEvent("field-event-a", "field-event-a");
		await seedEvent("field-event-b", "field-event-b");
		await seedForm("field-event-a", "field-form-a", "field-form-a");
		await seedForm("field-event-b", "field-form-b", "field-form-b");
		await env.DB.batch([
			env.DB.prepare("INSERT INTO form_fields (id, form_id, key, label, field_type, required, position, visibility_rule, config, soft_deleted) VALUES ('field-a', 'field-form-a', 'title', 'Title', 'text', 1, 0, '{\"op\":\"always\"}', '{\"kind\":\"text\"}', 0)"),
			env.DB.prepare("INSERT INTO form_fields (id, form_id, key, label, field_type, required, position, visibility_rule, config, soft_deleted) VALUES ('field-b', 'field-form-b', 'title', 'Foreign title', 'text', 1, 0, '{\"op\":\"always\"}', '{\"kind\":\"text\"}', 0)"),
		]);
		const update = {
			key: "title", label: "Hijacked", fieldType: "text" as const, required: true, position: 0,
			visibilityRule: { op: "always" as const }, config: { kind: "text" as const },
		};
		await expect(updateFormField(env.DB, "field-form-a", "field-b", update)).rejects.toThrow("Field not found");
		await expect(softDeleteFormField(env.DB, "field-form-a", "field-b")).rejects.toThrow("Field not found");
		await expect(reorderFormFields(env.DB, "field-form-a", ["field-b"])).rejects.toThrow("do not belong");
		expect(await env.DB.prepare("SELECT label, soft_deleted, position FROM form_fields WHERE id = 'field-b'").first<{ label: string; soft_deleted: number; position: number }>()).toEqual({ label: "Foreign title", soft_deleted: 0, position: 0 });
	});

	it("preserves existing account names across public login and invitation upserts", async () => {
		const existing = await upsertAccountByEmail(env.DB, { email: "known@account.test", name: "Trusted name" });
		expect((await upsertAccountByEmail(env.DB, { email: "known@account.test", name: "Attacker name" })).name).toBe("Trusted name");
		expect((await upsertAccountByEmail(env.DB, { email: "new@account.test", name: "New account" })).name).toBe("New account");
		await seedEvent("account-invite-event", "account-invite-event");
		await env.DB.prepare("INSERT INTO event_memberships (id, event_id, account_id, role, created_at) VALUES ('account-inviter-member', 'account-invite-event', ?, 'admin', ?)").bind(existing.id, now).run();
		const event = await env.DB.prepare("SELECT * FROM events WHERE id = 'account-invite-event'").first<import("@/lib/db/types").EventRow>();
		if (!event) throw new Error("seeded event missing");
		const invite = await inviteOrganizerToEvent(env.DB, {
			event, email: "known@account.test", name: "Invite overwrite", origin: "https://conference.example.test", exposeLoginUrl: true,
			secret: "account-invite-secret", invitedByAccountId: existing.id,
			sendEmail: async () => ({ ok: false, error: "rejected", failureKind: "confirmed" }),
		});
		expect(invite.ok && invite.account.name).toBe("Trusted name");
		expect(invite.ok && invite.loginUrl).toBeNull();
	});

	it("atomically fills empty account names once and handles concurrent first creation", async () => {
		await upsertAccountByEmail(env.DB, { id: "empty-account", email: "empty@account.test" });
		const candidates = ["Ada", "Bea", "Cy", "Dee", "Eli", "Fay"];
		const raced = await Promise.all(candidates.map((name) => upsertAccountByEmail(env.DB, {
			email: "empty@account.test", name,
		})));
		const stored = await env.DB.prepare("SELECT id, name, created_at FROM accounts WHERE email = 'empty@account.test'").first<{ id: string; name: string; created_at: number }>();
		expect(stored?.id).toBe("empty-account");
		expect(candidates).toContain(stored?.name);
		expect(new Set(raced.map((account) => account.id))).toEqual(new Set(["empty-account"]));
		expect((await upsertAccountByEmail(env.DB, { email: "empty@account.test", name: "Later overwrite" })).name).toBe(stored?.name);

		const created = await Promise.all(candidates.map((name) => upsertAccountByEmail(env.DB, {
			email: "first-race@account.test", name,
		})));
		const first = await env.DB.prepare("SELECT id, name FROM accounts WHERE email = 'first-race@account.test'").first<{ id: string; name: string }>();
		expect(first).not.toBeNull();
		expect(candidates).toContain(first?.name);
		expect(new Set(created.map((account) => account.id))).toEqual(new Set([first?.id]));
		expect((await env.DB.prepare("SELECT COUNT(*) AS count FROM accounts WHERE email = 'first-race@account.test'").first<{ count: number }>())?.count).toBe(1);
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

	it("prunes only rate-limit windows older than the retention horizon", async () => {
		const consume = (subject: string, at: number) => consumeFixedWindowRateLimit(env.DB, {
			secret: "prune-test-secret", bucket: "prune-test", subject, limit: 5, windowMs: 60_000, now: at,
		});
		await consume("stale-principal", now - 25 * 60 * 60_000);
		await consume("fresh-principal", now);
		expect(await pruneExpiredRateLimitBuckets(env.DB, { now })).toBe(1);
		const remaining = await env.DB.prepare("SELECT COUNT(*) AS count FROM rate_limit_buckets WHERE bucket = 'prune-test'").first<{ count: number }>();
		expect(remaining?.count).toBe(1);
		expect(await consume("fresh-principal", now)).toBe(true);
	});

	it("revives a removed co-speaker and rotates the previously delivered invite link", async () => {
		await seedEvent("revive-event", "revive-event");
		await seedForm("revive-event", "revive-form", "revive-form");
		await env.DB.batch([
			env.DB.prepare("INSERT INTO submissions (id, form_id, event_id, status, answers_json, created_at, updated_at) VALUES ('revive-submission', 'revive-form', 'revive-event', 'submitted', '{}', ?, ?)").bind(now, now),
			env.DB.prepare("INSERT INTO submission_speakers (id, submission_id, name, email, position, status) VALUES ('revive-primary', 'revive-submission', 'Primary', 'primary@revive.test', 0, 'confirmed')"),
			env.DB.prepare("INSERT INTO submission_speakers (id, submission_id, name, email, position, status) VALUES ('revive-co', 'revive-submission', 'Co Speaker', 'co@revive.test', 1, 'pending')"),
		]);
		const fetchMock = vi.fn(async () => new Response(JSON.stringify({ id: "revive-provider" }), { status: 200 }));
		vi.stubGlobal("fetch", fetchMock);
		try {
			const runtime = { authSecret: "revive-secret", resendApiKey: "test-key" };
			const origin = "https://conference.example.test";
			const first = await inviteCoSpeaker(env.DB, { speakerId: "revive-co", origin, runtime, mode: "initial" });
			expect(first.ok && first.email.status).toBe("sent");
			const oldToken = first.ok ? new URL(first.confirmUrl).pathname.split("/").pop() ?? "" : "";

			const removal = await removeCoSpeaker(env.DB, "revive-co");
			expect(removal.ok).toBe(true);

			const readded = await addCoSpeaker(env.DB, { submissionId: "revive-submission", name: "Co Speaker Again", email: "CO@revive.test" });
			expect(readded.ok && readded.revived).toBe(true);
			if (readded.ok) {
				expect(readded.speaker.id).toBe("revive-co");
				expect(readded.speaker.status).toBe("pending");
				expect(readded.speaker.name).toBe("Co Speaker Again");
			}
			expect((await env.DB.prepare("SELECT COUNT(*) AS count FROM submission_speakers WHERE submission_id = 'revive-submission'").first<{ count: number }>())?.count).toBe(2);

			// The route invites revived rows with mode "resend" so the delivered link rotates.
			const reinvite = await inviteCoSpeaker(env.DB, { speakerId: "revive-co", origin, runtime, mode: "resend" });
			expect(reinvite.ok && reinvite.email.status).toBe("sent");
			expect(fetchMock).toHaveBeenCalledTimes(2);
			expect((await env.DB.prepare("SELECT generation FROM co_speaker_invitation_claims WHERE speaker_id = 'revive-co'").first<{ generation: number }>())?.generation).toBe(2);
			const newToken = reinvite.ok ? new URL(reinvite.confirmUrl).pathname.split("/").pop() ?? "" : "";
			expect(newToken).not.toBe(oldToken);
			expect(await getSpeakerByConfirmToken(env.DB, oldToken)).toBeNull();
			expect((await getSpeakerByConfirmToken(env.DB, newToken))?.id).toBe("revive-co");

			const duplicate = await addCoSpeaker(env.DB, { submissionId: "revive-submission", name: "Dup", email: "co@revive.test" });
			expect(duplicate.ok).toBe(false);
			if (!duplicate.ok) expect(duplicate.status).toBe(409);
		} finally {
			vi.unstubAllGlobals();
		}
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

	it("keeps ambiguous organizer, portal, and event-invite links consumable", async () => {
		await seedEvent("delivery-link-event", "delivery-link-event");
		await env.DB.batch([
			env.DB.prepare("INSERT INTO accounts (id, email, name, created_at, updated_at) VALUES ('delivery-link-account', 'delivery@example.test', 'Delivery', ?, ?)").bind(now, now),
			env.DB.prepare("INSERT INTO people (id, email, name, created_at) VALUES ('delivery-link-person', 'speaker-delivery@example.test', 'Speaker', ?)").bind(now),
		]);
		const cases = [
			{ kind: "organizer_login" as const, token: "organizer-ambiguous", accountId: "delivery-link-account" },
			{ kind: "portal_login" as const, token: "portal-ambiguous", personId: "delivery-link-person", eventId: "delivery-link-event" },
			{ kind: "event_invite" as const, token: "invite-ambiguous", accountId: "delivery-link-account", eventId: "delivery-link-event" },
		];
		for (const entry of cases) {
			const challenge = await createAuthChallenge(env.DB, { secret: "delivery-link-secret", ...entry, now });
			expect(await failOneTimeLinkChallengeIfConfirmed(env.DB, {
				tokenHash: challenge.tokenHash,
				result: { ok: false, failureKind: "ambiguous" },
				reason: "transport timeout",
			})).toBe(false);
			expect(await consumeAuthChallenge(env.DB, { secret: "delivery-link-secret", token: entry.token, kind: entry.kind, now })).not.toBeNull();
		}
		const rejected = await createAuthChallenge(env.DB, { secret: "delivery-link-secret", kind: "organizer_login", accountId: "delivery-link-account", token: "organizer-rejected", now });
		expect(await failOneTimeLinkChallengeIfConfirmed(env.DB, {
			tokenHash: rejected.tokenHash,
			result: { ok: false, failureKind: "confirmed" },
			reason: "provider rejected",
		})).toBe(true);
		expect(await consumeAuthChallenge(env.DB, { secret: "delivery-link-secret", token: "organizer-rejected", kind: "organizer_login", now })).toBeNull();
	});

		it("keeps an uncertain event invitation acceptance-compatible after a post-send D1 failure", async () => {
		await seedEvent("ambiguous-invite-event", "ambiguous-invite-event");
		await env.DB.batch([
			env.DB.prepare("INSERT INTO accounts (id, email, name, created_at, updated_at) VALUES ('ambiguous-inviter', 'inviter@ambiguous.test', 'Inviter', ?, ?)").bind(now, now),
			env.DB.prepare("INSERT INTO event_memberships (id, event_id, account_id, role, created_at) VALUES ('ambiguous-inviter-member', 'ambiguous-invite-event', 'ambiguous-inviter', 'admin', ?)").bind(now),
		]);
		const event = await env.DB.prepare("SELECT * FROM events WHERE id = 'ambiguous-invite-event'").first<import("@/lib/db/types").EventRow>();
		if (!event) throw new Error("seeded event missing");
		let rawToken = "";
		let acceptedDuringSend: { accountId: string; eventId: string } | null = null;
		const result = await inviteOrganizerToEvent(env.DB, {
			event,
			email: "invitee@ambiguous.test",
			role: "admin",
			origin: "https://conference.example.test",
			exposeLoginUrl: false,
			secret: "ambiguous-invite-secret",
			invitedByAccountId: "ambiguous-inviter",
			sendEmail: async (message) => {
				rawToken = new URL(message.context.loginUrl ?? "").searchParams.get("token") ?? "";
				acceptedDuringSend = await acceptEventInvitation(env.DB, { secret: "ambiguous-invite-secret", token: rawToken, now });
				// The provider accepted the message, then a non-essential local write
				// failed. The invitation was already acceptance-compatible.
				try { await env.DB.prepare("INSERT INTO missing_post_send_table VALUES (1)").run(); } catch { /* simulated D1 failure */ }
				return { ok: false, error: "connection lost", failureKind: "ambiguous" };
			},
		});
		expect(result.ok && result.emailStatus).toBe("uncertain");
		expect(rawToken).not.toBe("");
		expect(acceptedDuringSend).not.toBeNull();
		expect(await env.DB.prepare("SELECT status FROM event_invitations WHERE id = ?").bind(result.ok ? result.invitationId : "").first<{ status: string }>()).toEqual({ status: "accepted" });
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
