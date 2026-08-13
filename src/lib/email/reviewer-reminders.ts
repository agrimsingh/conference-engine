import { validatedAppOrigin } from "../security/origin";
import { sendTemplatedEmail } from "./resend";
import type { ReminderEnv, ReminderRunResult } from "./reminders";
import { REMINDER_DELIVERY_WINDOW_MS } from "./reminders";
import { REVIEW_BOARD_STATUS_SQL } from "@/lib/domain";

type OutstandingReviewRow = {
	reviewer_id: string;
	reviewer_name: string;
	reviewer_email: string;
	event_id: string;
	event_name: string;
	event_slug: string;
	submission_id: string;
	answers_json: string;
};

type ReviewerGroup = {
	reviewerId: string;
	email: string;
	reviewerName: string;
	eventId: string;
	eventName: string;
	eventSlug: string;
	titles: string[];
};

function titleFromAnswersJson(raw: string): string {
	try {
		const parsed: unknown = JSON.parse(raw);
		if (
			typeof parsed === "object" &&
			parsed !== null &&
			"title" in parsed &&
			typeof (parsed as { title: unknown }).title === "string"
		) {
			return (parsed as { title: string }).title;
		}
	} catch {
		// ignore
	}
	return "(untitled)";
}

/**
 * Email named reviewers who still have active incomplete assignments.
 * Dedupes via delivery ledger scope `reviewer-reminder-window:<window>`.
 * Does not rotate review tokens (link from invite remains valid).
 */
export async function sendOutstandingReviewerReminders(
	env: ReminderEnv,
	options: {
		eventId: string;
		planId: string;
		now?: number;
	},
): Promise<ReminderRunResult> {
	const rows = await loadOutstandingReviewRows(env.DB, options.eventId, options.planId);
	const groups = groupByReviewer(rows);
	if (!validatedAppOrigin(env.APP_ORIGIN)) {
		return {
			sent: 0,
			skipped: groups.length,
			configurationError: "APP_ORIGIN must be an absolute http(s) origin without a path",
		};
	}
	if (!env.AUTH_SECRET) {
		return {
			sent: 0,
			skipped: groups.length,
			configurationError: "AUTH_SECRET is required for durable reminder delivery",
		};
	}

	const reminderWindow = Math.floor((options.now ?? Date.now()) / REMINDER_DELIVERY_WINDOW_MS);
	let sent = 0;
	let skipped = 0;

	for (const group of groups) {
		const count = group.titles.length;
		const context = {
			eventName: group.eventName,
			submitterName: group.reviewerName.trim() || "there",
			title: `${count} outstanding review${count === 1 ? "" : "s"}`,
			outstandingCount: count,
			taskLabels: group.titles,
			portalHint:
				"Open your personal review link from your invite email to finish scoring.",
		};
		const sendResult = await sendTemplatedEmail(env.DB, {
			eventId: group.eventId,
			submissionId: null,
			toEmail: group.email,
			templateKey: "reviewer_outstanding_reminder",
			context,
			deliveryScope: `reviewer-reminder-window:${reminderWindow}`,
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

async function loadOutstandingReviewRows(
	db: D1Database,
	eventId: string,
	planId: string,
): Promise<OutstandingReviewRow[]> {
	const result = await db
		.prepare(
			`SELECT
         r.id AS reviewer_id,
         r.name AS reviewer_name,
         r.email AS reviewer_email,
         e.id AS event_id,
         e.name AS event_name,
         e.slug AS event_slug,
         s.id AS submission_id,
         s.answers_json AS answers_json
       FROM review_assignments ra
       INNER JOIN reviewers r ON r.id = ra.reviewer_id
       INNER JOIN submissions s ON s.id = ra.submission_id
       INNER JOIN events e ON e.id = s.event_id
       WHERE ra.plan_id = ?
         AND s.event_id = ?
         AND s.status IN (${REVIEW_BOARD_STATUS_SQL})
         AND r.revoked_at IS NULL
         AND ra.recused_at IS NULL
         AND r.email IS NOT NULL
         AND TRIM(r.email) <> ''
         AND e.mode <> 'demo'
         AND NOT EXISTS (
           SELECT 1 FROM evaluation_scores es
           WHERE es.plan_id = ra.plan_id
             AND es.submission_id = ra.submission_id
             AND es.reviewer_id = ra.reviewer_id
         )
       ORDER BY r.id ASC, s.created_at DESC`,
		)
		.bind(planId, eventId)
		.all<OutstandingReviewRow>();
	return result.results;
}

function groupByReviewer(rows: OutstandingReviewRow[]): ReviewerGroup[] {
	const map = new Map<string, ReviewerGroup>();
	for (const row of rows) {
		const email = row.reviewer_email.trim().toLowerCase();
		if (!email) continue;
		const existing = map.get(row.reviewer_id);
		const title = titleFromAnswersJson(row.answers_json);
		if (existing) {
			existing.titles.push(title);
			continue;
		}
		map.set(row.reviewer_id, {
			reviewerId: row.reviewer_id,
			email,
			reviewerName: row.reviewer_name,
			eventId: row.event_id,
			eventName: row.event_name,
			eventSlug: row.event_slug,
			titles: [title],
		});
	}
	return [...map.values()];
}
