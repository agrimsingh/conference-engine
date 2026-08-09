import { issueDraftResumeToken } from "../cfp/drafts";
import { validatedAppOrigin } from "../security/origin";
import { deterministicDeliveryKey, sendTemplatedEmail } from "./resend";
import type { ReminderEnv, ReminderRunResult } from "./reminders";

/**
 * Default lookback before `closes_at`. Drafts enter the reminder cohort when
 * `now` is inside `[closes_at - WINDOW, closes_at)`. 72h balances "soon enough
 * to act" against spamming weeks-out CFPs; one send per draft×close via ledger.
 */
export const DRAFT_REMINDER_WINDOW_MS = 72 * 60 * 60_000;

export type DraftReminderIneligibility =
	| "no_close_date"
	| "before_window"
	| "past_close";

export type DraftReminderEligibility =
	| { eligible: false; reason: DraftReminderIneligibility }
	| { eligible: true; closesAt: number; windowStart: number };

/** Pure gate: close date set ⇒ reminders can fire; only inside the pre-close window. */
export function evaluateDraftReminderEligibility(args: {
	closesAt: number | null;
	now: number;
	windowMs?: number;
}): DraftReminderEligibility {
	const windowMs = args.windowMs ?? DRAFT_REMINDER_WINDOW_MS;
	if (args.closesAt === null) return { eligible: false, reason: "no_close_date" };
	if (args.now >= args.closesAt) return { eligible: false, reason: "past_close" };
	const windowStart = args.closesAt - windowMs;
	if (args.now < windowStart) return { eligible: false, reason: "before_window" };
	return { eligible: true, closesAt: args.closesAt, windowStart };
}

type DraftReminderRow = {
	draft_id: string;
	event_id: string;
	event_slug: string;
	event_name: string;
	form_id: string;
	form_slug: string;
	form_title: string;
	closes_at: number;
	verified_email: string;
	submitter_name: string;
};

/**
 * Cron: email unfinished drafts on forms with `closes_at` set, inside the
 * pre-close window. Idempotent via a stable delivery_key (draft × closes_at).
 * Does not use form `reminder_copy` (that prefixes speaker task reminders).
 */
export async function sendDraftReminders(
	env: ReminderEnv,
	options?: { now?: number; windowMs?: number; eventId?: string },
): Promise<ReminderRunResult> {
	const now = options?.now ?? Date.now();
	const windowMs = options?.windowMs ?? DRAFT_REMINDER_WINDOW_MS;
	const rows = await loadReminderEligibleDrafts(env.DB, {
		now,
		windowMs,
		eventId: options?.eventId,
	});
	const portalOrigin = validatedAppOrigin(env.APP_ORIGIN);
	if (!portalOrigin) {
		return {
			sent: 0,
			skipped: rows.length,
			configurationError: "APP_ORIGIN must be an absolute http(s) origin without a path",
		};
	}
	if (!env.AUTH_SECRET) {
		return {
			sent: 0,
			skipped: rows.length,
			configurationError: "AUTH_SECRET is required for durable reminder delivery",
		};
	}

	let sent = 0;
	let skipped = 0;

	for (const row of rows) {
		const deliveryKey = await deterministicDeliveryKey(env.AUTH_SECRET, {
			eventId: row.event_id,
			submissionId: null,
			templateKey: "draft_reminder",
			toEmail: row.verified_email,
			subject: "draft_reminder",
			text: "draft_reminder",
			deliveryScope: `draft:${row.draft_id}:closes:${row.closes_at}`,
		});
		const prior = await env.DB.prepare(
			`SELECT status FROM email_deliveries WHERE delivery_key = ?`,
		)
			.bind(deliveryKey)
			.first<{ status: string }>();
		if (
			prior &&
			(prior.status === "sent" ||
				prior.status === "provider_accepted" ||
				prior.status === "sending")
		) {
			skipped += 1;
			continue;
		}

		const token = await issueDraftResumeToken(env.DB, {
			secret: env.AUTH_SECRET,
			draftId: row.draft_id,
			deliveryVerified: true,
			now,
		});
		const resumeUrl = new URL(`/e/${row.event_slug}/submit/${row.form_slug}`, portalOrigin);
		resumeUrl.searchParams.set("draft", token);
		const closesAtIso = new Date(row.closes_at).toISOString();
		const context = {
			eventName: row.event_name,
			submitterName: row.submitter_name.trim() || "there",
			title: row.form_title,
			portalUrl: resumeUrl.toString(),
			endsAtIso: closesAtIso,
		};
		const sendResult = await sendTemplatedEmail(env.DB, {
			eventId: row.event_id,
			submissionId: null,
			toEmail: row.verified_email,
			templateKey: "draft_reminder",
			context,
			deliveryKey,
			runtime: {
				authSecret: env.AUTH_SECRET,
				resendApiKey: env.RESEND_API_KEY,
				resendFromEmail: env.RESEND_FROM_EMAIL,
			},
		});

		if (!sendResult.ok || sendResult.status === "skipped") {
			skipped += 1;
			continue;
		}
		sent += 1;
	}

	return { sent, skipped };
}

async function loadReminderEligibleDrafts(
	db: D1Database,
	args: { now: number; windowMs: number; eventId?: string },
): Promise<DraftReminderRow[]> {
	const windowEnd = args.now + args.windowMs;
	const eventClause = args.eventId ? " AND d.event_id = ?" : "";
	const result = await db
		.prepare(
			`SELECT
				d.id AS draft_id,
				d.event_id AS event_id,
				e.slug AS event_slug,
				e.name AS event_name,
				d.form_id AS form_id,
				f.slug AS form_slug,
				f.title AS form_title,
				f.closes_at AS closes_at,
				d.verified_email AS verified_email,
				d.submitter_name AS submitter_name
			FROM submission_drafts d
			INNER JOIN cfp_forms f ON f.id = d.form_id
			INNER JOIN events e ON e.id = d.event_id
			WHERE d.status = 'draft'
				AND f.drafts_enabled = 1
				AND f.status = 'open'
				AND f.closes_at IS NOT NULL
				AND f.closes_at > ?
				AND f.closes_at <= ?
				AND (f.opens_at IS NULL OR f.opens_at <= ?)
				AND e.mode <> 'demo'${eventClause}
			ORDER BY f.closes_at ASC, d.id ASC`,
		)
		.bind(args.now, windowEnd, args.now, ...(args.eventId ? [args.eventId] : []))
		.all<DraftReminderRow>();
	return result.results;
}
