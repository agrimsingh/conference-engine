import { env } from "cloudflare:workers";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
	DRAFT_REMINDER_WINDOW_MS,
	sendDraftReminders,
} from "@/lib/email/draft-reminders";

const now = 1_780_700_000_000;
const closesAt = now + 24 * 60 * 60_000;

afterEach(() => {
	vi.unstubAllGlobals();
});

async function seed(prefix: string, args?: {
	closesAt?: number | null;
	draftStatus?: "draft" | "submitted";
	formStatus?: string;
	draftsEnabled?: number;
	eventMode?: string;
}): Promise<{ eventId: string; draftId: string }> {
	const eventId = `${prefix}-event`;
	const formId = `${prefix}-form`;
	const draftId = `${prefix}-draft`;
	const close = args?.closesAt === undefined ? closesAt : args.closesAt;
	await env.DB.batch([
		env.DB.prepare(
			"INSERT INTO events (id, slug, name, timezone, mode, created_at, updated_at) VALUES (?, ?, 'Draft Reminder Event', 'UTC', ?, ?, ?)",
		).bind(eventId, eventId, args?.eventMode ?? "live", now, now),
		env.DB.prepare(
			`INSERT INTO cfp_forms (
				id, event_id, slug, title, status, drafts_enabled, closes_at, created_at, updated_at
			) VALUES (?, ?, 'cfp', 'Sandbox CFP', ?, ?, ?, ?, ?)`,
		).bind(
			formId,
			eventId,
			args?.formStatus ?? "open",
			args?.draftsEnabled ?? 1,
			close,
			now,
			now,
		),
		env.DB.prepare(
			`INSERT INTO submission_drafts (
				id, event_id, form_id, verified_email, submitter_name, answers_json, status, created_at, updated_at
			) VALUES (?, ?, ?, 'draft@example.test', 'Drafty', '{}', ?, ?, ?)`,
		).bind(draftId, eventId, formId, args?.draftStatus ?? "draft", now, now),
	]);
	return { eventId, draftId };
}

function reminderEnv() {
	return {
		DB: env.DB,
		AUTH_SECRET: "draft-reminder-secret",
		APP_ORIGIN: "https://conference.example.test",
		RESEND_API_KEY: "test",
		RESEND_FROM_EMAIL: "team@example.test",
	};
}

describe("draft reminder cron delivery", () => {
	it("sends once for an open draft inside the pre-close window and skips the duplicate", async () => {
		const { eventId } = await seed("draft-rem-once");
		const fetchMock = vi.fn<typeof fetch>(() =>
			Promise.resolve(new Response(JSON.stringify({ id: "draft-reminder-provider" }), { status: 200 })),
		);
		vi.stubGlobal("fetch", fetchMock);

		expect(
			await sendDraftReminders(reminderEnv(), {
				now,
				windowMs: DRAFT_REMINDER_WINDOW_MS,
				eventId,
			}),
		).toEqual({ sent: 1, skipped: 0 });
		expect(fetchMock).toHaveBeenCalledTimes(1);

		const envelope = await env.DB
			.prepare(
				"SELECT to_email, text_body FROM email_delivery_envelopes WHERE event_id = ? AND template_key = 'draft_reminder'",
			)
			.bind(eventId)
			.first<{ to_email: string; text_body: string }>();
		expect(envelope?.to_email).toBe("draft@example.test");
		expect(envelope?.text_body).toContain(`https://conference.example.test/e/${eventId}/submit/cfp?draft=`);
		expect(envelope?.text_body).toContain("Sandbox CFP");

		expect(
			await sendDraftReminders(reminderEnv(), {
				now,
				windowMs: DRAFT_REMINDER_WINDOW_MS,
				eventId,
			}),
		).toEqual({ sent: 0, skipped: 1 });
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});

	it("skips drafts when closes_at is unset", async () => {
		const { eventId } = await seed("draft-rem-noclose", { closesAt: null });
		expect(await sendDraftReminders(reminderEnv(), { now, eventId })).toEqual({ sent: 0, skipped: 0 });
	});

	it("skips drafts outside the pre-close window", async () => {
		const { eventId } = await seed("draft-rem-early", {
			closesAt: now + DRAFT_REMINDER_WINDOW_MS + 60_000,
		});
		expect(await sendDraftReminders(reminderEnv(), { now, eventId })).toEqual({ sent: 0, skipped: 0 });
	});

	it("skips submitted drafts", async () => {
		const { eventId } = await seed("draft-rem-submitted", { draftStatus: "submitted" });
		expect(await sendDraftReminders(reminderEnv(), { now, eventId })).toEqual({ sent: 0, skipped: 0 });
	});

	it("skips closed forms", async () => {
		const { eventId } = await seed("draft-rem-closed", { formStatus: "closed" });
		expect(await sendDraftReminders(reminderEnv(), { now, eventId })).toEqual({ sent: 0, skipped: 0 });
	});
});
