import {
	isSpeakerTaskKey,
	SPEAKER_TASK_TYPE_REGISTRY,
} from "../domain/speaker-tasks";
import {
	renderMessageTemplate,
} from "../domain/message-templates";
import { renderFormCopy } from "../cfp/form-copy";
import { validatedAppOrigin } from "../security/origin";
import { sendTemplatedEmail } from "./resend";

const REMINDER_KV_TTL_SECONDS = 20 * 60 * 60;
export const REMINDER_DELIVERY_WINDOW_MS = 20 * 60 * 60_000;

export type ReminderEnv = {
	DB: D1Database;
	SESSIONS?: KVNamespace;
	RESEND_API_KEY?: string;
	RESEND_FROM_EMAIL?: string;
	AUTH_SECRET?: string;
	APP_ORIGIN?: string;
};

export type ReminderRunResult = {
	sent: number;
	skipped: number;
	configurationError?: string;
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
		now?: number;
	},
): Promise<ReminderRunResult> {
	const rows = await loadPendingTaskRows(env.DB, options?.eventId);
	const groups = groupByPersonEvent(rows);
	const portalOrigin = validatedAppOrigin(env.APP_ORIGIN);
	if (!portalOrigin) {
		return { sent: 0, skipped: groups.length, configurationError: "APP_ORIGIN must be an absolute http(s) origin without a path" };
	}
	if (!env.AUTH_SECRET) {
		return { sent: 0, skipped: groups.length, configurationError: "AUTH_SECRET is required for durable reminder delivery" };
	}
	const reminderWindow = Math.floor((options?.now ?? Date.now()) / REMINDER_DELIVERY_WINDOW_MS);

	let sent = 0;
	let skipped = 0;

	for (const group of groups) {
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

		const text = composeReminderText(rendered.text, group.reminderCopy, {
			eventName: group.eventName,
			submitterName: group.personName?.trim() || "there",
			title: `${count} outstanding tasks`,
			resumeUrl: `${portalOrigin}/portal`,
		});
		const sendResult = await sendTemplatedEmail(env.DB, {
			eventId: group.eventId,
			submissionId: null,
			toEmail: group.email,
			templateKey: "task_reminder",
			context: { eventName: group.eventName, submitterName: group.personName?.trim() || "there", title: `${count} outstanding tasks`, outstandingCount: count, taskLabels: labels, portalHint },
			override: { subject: rendered.subject, text },
			deliveryScope: `reminder-window:${reminderWindow}`,
			runtime: { authSecret: env.AUTH_SECRET, resendApiKey: env.RESEND_API_KEY, resendFromEmail: env.RESEND_FROM_EMAIL },
		});

		if (!sendResult.ok) {
			skipped += 1;
			continue;
		}
		if (sendResult.status === "skipped") {
			skipped += 1;
			continue;
		}

		// Secondary cache only. D1 delivery_key is the authority for dedupe.
		if (env.SESSIONS) {
			await env.SESSIONS.put(reminderKvKey(group.personId, group.eventId), String(Date.now()), {
				expirationTtl: REMINDER_KV_TTL_SECONDS,
			});
		}
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
