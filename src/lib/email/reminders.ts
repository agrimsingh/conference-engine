import {
	isSpeakerTaskKey,
	SPEAKER_TASK_TYPE_REGISTRY,
} from "../domain/speaker-tasks";
import { fetchWithBoundedRetry } from "../security/fetch";
import {
	renderMessageTemplate,
	type MessageTemplateKey,
} from "../domain/message-templates";
import { renderFormCopy } from "../cfp/form-copy";

const REMINDER_KV_TTL_SECONDS = 20 * 60 * 60;
const DEFAULT_PORTAL_ORIGIN = "https://conference-engine.65labs.org";

export type ReminderEnv = {
	DB: D1Database;
	SESSIONS: KVNamespace;
	RESEND_API_KEY?: string;
	RESEND_FROM_EMAIL?: string;
};

export type ReminderRunResult = {
	sent: number;
	skipped: number;
};

type PendingTaskRow = {
	person_id: string;
	event_id: string;
	template_key: string;
	email: string;
	person_name: string | null;
	event_name: string;
	event_slug: string;
	reminder_copy: string | null;
};

type PersonEventGroup = {
	personId: string;
	eventId: string;
	email: string;
	personName: string | null;
	eventName: string;
	eventSlug: string;
	templateKeys: string[];
	reminderCopy: string | null;
};

function reminderKvKey(personId: string, eventId: string): string {
	return `reminder:${personId}:${eventId}`;
}

function taskLabel(templateKey: string): string {
	if (isSpeakerTaskKey(templateKey)) {
		return SPEAKER_TASK_TYPE_REGISTRY[templateKey].label;
	}
	return templateKey;
}

/**
 * Query pending speaker_tasks, group by person+event, send one reminder email
 * per group. KV key `reminder:<personId>:<eventId>` (TTL 20h) dedupes.
 * Per-person send failures count as skipped (never throws for Resend errors).
 */
export async function sendTaskReminders(
	env: ReminderEnv,
	options?: {
		eventId?: string;
		portalBaseUrl?: string;
	},
): Promise<ReminderRunResult> {
	const rows = await loadPendingTaskRows(env.DB, options?.eventId);
	const groups = groupByPersonEvent(rows);
	const portalOrigin = (options?.portalBaseUrl ?? DEFAULT_PORTAL_ORIGIN).replace(
		/\/$/,
		"",
	);

	let sent = 0;
	let skipped = 0;

	for (const group of groups) {
		const kvKey = reminderKvKey(group.personId, group.eventId);
		const existing = await env.SESSIONS.get(kvKey);
		if (existing) {
			skipped += 1;
			continue;
		}

		const labels = group.templateKeys.map(taskLabel);
		const count = labels.length;
		const portalHint = `Sign in at ${portalOrigin}/portal to complete them.`;
		const rendered = renderMessageTemplate("task_reminder", {
			eventName: group.eventName,
			submitterName: group.personName?.trim() || "there",
			title: `${count} outstanding tasks`,
			outstandingCount: count,
			taskLabels: labels,
			portalHint,
		});

		const sendResult = await sendReminderEmail(env, {
			eventId: group.eventId,
			toEmail: group.email,
			subject: rendered.subject,
			text: composeReminderText(rendered.text, group.reminderCopy, {
				eventName: group.eventName,
				submitterName: group.personName?.trim() || "there",
				title: `${count} outstanding tasks`,
				resumeUrl: `${portalOrigin}/portal`,
			}),
			templateKey: "task_reminder",
		});

		if (!sendResult.ok) {
			skipped += 1;
			continue;
		}

		await env.SESSIONS.put(kvKey, String(Date.now()), {
			expirationTtl: REMINDER_KV_TTL_SECONDS,
		});
		sent += 1;
	}

	return { sent, skipped };
}

async function loadPendingTaskRows(
	db: D1Database,
	eventId?: string,
): Promise<PendingTaskRow[]> {
	if (eventId) {
		const result = await db
			.prepare(
				`SELECT
					st.person_id AS person_id,
					st.event_id AS event_id,
					st.template_key AS template_key,
					p.email AS email,
					p.name AS person_name,
					e.name AS event_name,
					e.slug AS event_slug,
					f.reminder_copy AS reminder_copy
				FROM speaker_tasks st
				INNER JOIN people p ON p.id = st.person_id
				INNER JOIN events e ON e.id = st.event_id
				INNER JOIN submissions s ON s.id = st.submission_id
				INNER JOIN cfp_forms f ON f.id = s.form_id
				WHERE st.status = 'pending' AND st.event_id = ?
				ORDER BY st.person_id, st.event_id, st.created_at ASC`,
			)
			.bind(eventId)
			.all<PendingTaskRow>();
		return result.results;
	}

	const result = await db
		.prepare(
			`SELECT
				st.person_id AS person_id,
				st.event_id AS event_id,
				st.template_key AS template_key,
				p.email AS email,
				p.name AS person_name,
				e.name AS event_name,
			e.slug AS event_slug,
			f.reminder_copy AS reminder_copy
			FROM speaker_tasks st
			INNER JOIN people p ON p.id = st.person_id
			INNER JOIN events e ON e.id = st.event_id
			INNER JOIN submissions s ON s.id = st.submission_id
			INNER JOIN cfp_forms f ON f.id = s.form_id
			WHERE st.status = 'pending'
			ORDER BY st.person_id, st.event_id, st.created_at ASC`,
		)
		.all<PendingTaskRow>();
	return result.results;
}

function groupByPersonEvent(rows: PendingTaskRow[]): PersonEventGroup[] {
	const map = new Map<string, PersonEventGroup>();
	for (const row of rows) {
		const key = `${row.person_id}:${row.event_id}`;
		const existing = map.get(key);
		if (existing) {
			existing.templateKeys.push(row.template_key);
			if (!existing.reminderCopy && row.reminder_copy?.trim()) {
				existing.reminderCopy = row.reminder_copy;
			}
			continue;
		}
		map.set(key, {
			personId: row.person_id,
			eventId: row.event_id,
			email: row.email,
			personName: row.person_name,
			eventName: row.event_name,
			eventSlug: row.event_slug,
			templateKeys: [row.template_key],
			reminderCopy: row.reminder_copy?.trim() || null,
		});
	}
	return [...map.values()];
}

export function composeReminderText(
	defaultText: string,
	reminderCopy: string | null,
	context: { eventName: string; submitterName: string; title: string; resumeUrl: string },
): string {
	if (!reminderCopy?.trim()) return defaultText;
	return `${renderFormCopy(reminderCopy, context).trim()}\n\n${defaultText}`;
}

type ReminderSendResult = { ok: true } | { ok: false; error: string };

async function sendReminderEmail(
	env: ReminderEnv,
	args: {
		eventId: string;
		toEmail: string;
		subject: string;
		text: string;
		templateKey: MessageTemplateKey;
	},
): Promise<ReminderSendResult> {
	const toEmail = args.toEmail.trim().toLowerCase();
	const messageId = crypto.randomUUID();
	const now = Date.now();
	const apiKey = env.RESEND_API_KEY;
	const fromEmail = env.RESEND_FROM_EMAIL || "team@65labs.org";

	if (!apiKey) {
		await insertOutbound(env.DB, {
			id: messageId,
			eventId: args.eventId,
			templateKey: args.templateKey,
			toEmail,
			subject: args.subject,
			status: "failed",
			providerId: null,
			error: "RESEND_API_KEY missing",
			createdAt: now,
		});
		return { ok: false, error: "RESEND_API_KEY missing" };
	}

	try {
		const response = await fetchWithBoundedRetry("https://api.resend.com/emails", {
			method: "POST",
			headers: {
				Authorization: `Bearer ${apiKey}`,
				"Content-Type": "application/json",
				"Idempotency-Key": messageId,
			},
			body: JSON.stringify({
				from: fromEmail,
				to: [toEmail],
				subject: args.subject,
				text: args.text,
			}),
		});

		const bodyText = await response.text();
		let providerId: string | null = null;
		let errorMessage: string | null = null;
		try {
			const parsed: unknown = JSON.parse(bodyText);
			if (
				typeof parsed === "object" &&
				parsed !== null &&
				"id" in parsed &&
				typeof (parsed as { id: unknown }).id === "string"
			) {
				providerId = (parsed as { id: string }).id;
			}
			if (
				typeof parsed === "object" &&
				parsed !== null &&
				"message" in parsed &&
				typeof (parsed as { message: unknown }).message === "string"
			) {
				errorMessage = (parsed as { message: string }).message;
			}
		} catch {
			errorMessage = bodyText || `HTTP ${response.status}`;
		}

		if (!response.ok) {
			const error = errorMessage ?? `Resend HTTP ${response.status}`;
			await insertOutbound(env.DB, {
				id: messageId,
				eventId: args.eventId,
				templateKey: args.templateKey,
				toEmail,
				subject: args.subject,
				status: "failed",
				providerId: null,
				error,
				createdAt: now,
			});
			return { ok: false, error };
		}

		await insertOutbound(env.DB, {
			id: messageId,
			eventId: args.eventId,
			templateKey: args.templateKey,
			toEmail,
			subject: args.subject,
			status: "sent",
			providerId,
			error: null,
			createdAt: now,
		});
		return { ok: true };
	} catch (error) {
		const message = error instanceof Error ? error.message : "send failed";
		await insertOutbound(env.DB, {
			id: messageId,
			eventId: args.eventId,
			templateKey: args.templateKey,
			toEmail,
			subject: args.subject,
			status: "failed",
			providerId: null,
			error: message,
			createdAt: now,
		});
		return { ok: false, error: message };
	}
}

async function insertOutbound(
	db: D1Database,
	row: {
		id: string;
		eventId: string;
		templateKey: string;
		toEmail: string;
		subject: string;
		status: "sent" | "failed" | "skipped";
		providerId: string | null;
		error: string | null;
		createdAt: number;
	},
): Promise<void> {
	await db
		.prepare(
			`INSERT INTO outbound_messages (
				id, event_id, submission_id, template_key, to_email, subject,
				status, provider_id, error, created_at
			) VALUES (?, ?, NULL, ?, ?, ?, ?, ?, ?, ?)`,
		)
		.bind(
			row.id,
			row.eventId,
			row.templateKey,
			row.toEmail,
			row.subject,
			row.status,
			row.providerId,
			row.error,
			row.createdAt,
		)
		.run();
}
