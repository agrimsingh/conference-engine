import { renderFormCopy } from "../cfp/form-copy";
import { validatedAppOrigin } from "../security/origin";
import { sendTemplatedEmail } from "./resend";
import { renderEventMessageTemplate } from "./templates";

const REMINDER_KV_TTL_SECONDS = 20 * 60 * 60;
export const REMINDER_DELIVERY_WINDOW_MS = 20 * 60 * 60_000;

let reminderDueAtColumnCache: boolean | null = null;

async function speakerTasksHaveDueAtColumn(db: D1Database): Promise<boolean> {
	if (reminderDueAtColumnCache !== null) return reminderDueAtColumnCache;
	const info = await db.prepare("PRAGMA table_info(speaker_tasks)").all<{ name: string }>();
	reminderDueAtColumnCache = info.results.some((column) => column.name === "due_at");
	return reminderDueAtColumnCache;
}

/** Test helper: clear PRAGMA cache between cases. */
export function resetReminderDueAtColumnCache(): void {
	reminderDueAtColumnCache = null;
}

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

/** Cron/automated: only tasks whose due date has arrived. Admin "remind now": all pending. */
export type ReminderDueMode = "due_or_overdue" | "all_pending";

/**
 * SQL fragment for due-date-aware selection.
 * Rule: `due_at IS NOT NULL AND due_at <= now` when the column exists and mode is due_or_overdue.
 * Missing `due_at` column falls back to no due filter (legacy DBs).
 */
export function dueAwarePendingFilter(args: {
	hasDueAtColumn: boolean;
	dueMode: ReminderDueMode;
	now: number;
}): { clause: string; binds: number[] } {
	if (!args.hasDueAtColumn || args.dueMode === "all_pending") {
		return { clause: "", binds: [] };
	}
	return {
		clause: " AND st.due_at IS NOT NULL AND st.due_at <= ?",
		binds: [args.now],
	};
}

type PendingTaskRow = {
	person_id: string;
	event_id: string;
	template_key: string;
	template_label: string;
	template_task_kind: "text" | "file";
	template_required: number;
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
	taskLabels: string[];
	reminderCopy: string | null;
};

function reminderKvKey(personId: string, eventId: string): string {
	return `reminder:${personId}:${eventId}`;
}

/**
 * Query pending speaker_tasks, group by person+event, send one reminder email
 * per group. KV key `reminder:<personId>:<eventId>` (TTL 20h) dedupes.
 * Per-person send failures count as skipped (never throws for Resend errors).
 *
 * Default dueMode is due_or_overdue (cron-safe). Pass all_pending for explicit
 * admin "remind now" / roster task-reminder sends.
 */
export async function sendTaskReminders(
	env: ReminderEnv,
	options?: {
		eventId?: string;
		/** A manual retry must remain inside the event selected by the organizer. */
		personIds?: string[];
		now?: number;
		dueMode?: ReminderDueMode;
	},
): Promise<ReminderRunResult> {
	const now = options?.now ?? Date.now();
	const dueMode = options?.dueMode ?? "due_or_overdue";
	const rows = await loadPendingTaskRows(env.DB, {
		eventId: options?.eventId,
		personIds: options?.personIds,
		now,
		dueMode,
	});
	const groups = groupByPersonEvent(rows);
	const portalOrigin = validatedAppOrigin(env.APP_ORIGIN);
	if (!portalOrigin) {
		return { sent: 0, skipped: groups.length, configurationError: "APP_ORIGIN must be an absolute http(s) origin without a path" };
	}
	if (!env.AUTH_SECRET) {
		return { sent: 0, skipped: groups.length, configurationError: "AUTH_SECRET is required for durable reminder delivery" };
	}
	const reminderWindow = Math.floor(now / REMINDER_DELIVERY_WINDOW_MS);

	let sent = 0;
	let skipped = 0;

	for (const group of groups) {
		const labels = group.taskLabels;
		const count = labels.length;
		const portalHint = `Sign in at ${portalOrigin}/portal to complete them.`;
		const context = {
			eventName: group.eventName,
			submitterName: group.personName?.trim() || "there",
			title: `${count} outstanding tasks`,
			outstandingCount: count,
			taskLabels: labels,
			portalHint,
		};
		const rendered = await renderEventMessageTemplate(env.DB, group.eventId, "task_reminder", context);

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
			context,
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
	args: {
		eventId?: string;
		personIds?: string[];
		now: number;
		dueMode: ReminderDueMode;
	},
): Promise<PendingTaskRow[]> {
	const selectedPeople = [...new Set(args.personIds?.filter(Boolean) ?? [])];
	// An explicit empty segment is never an alias for every speaker.
	if (args.personIds !== undefined && selectedPeople.length === 0) return [];
	const personClause = selectedPeople.length
		? ` AND st.person_id IN (${selectedPeople.map(() => "?").join(", ")})`
		: "";
	const hasDueAtColumn = await speakerTasksHaveDueAtColumn(db);
	const dueFilter = dueAwarePendingFilter({
		hasDueAtColumn,
		dueMode: args.dueMode,
		now: args.now,
	});
	const actionDueFilter = args.dueMode === "all_pending" ? { clause: "", binds: [] as number[] } : { clause: " AND t.due_at IS NOT NULL AND t.due_at <= ?", binds: [args.now] };
	if (args.eventId) {
		const result = await db
			.prepare(
				`SELECT
					st.person_id AS person_id,
					st.event_id AS event_id,
					st.template_key AS template_key,
					st.template_label AS template_label,
					st.template_task_kind AS template_task_kind,
					st.template_required AS template_required,
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
					WHERE st.status = 'pending' AND st.template_required = 1 AND st.event_id = ? AND e.mode <> 'demo'${personClause}${dueFilter.clause}
					UNION ALL
					SELECT a.person_id, a.event_id, 'speaker_action' AS template_key,
						t.title || CASE WHEN t.due_at IS NULL THEN '' ELSE ' — due ' || strftime('%Y-%m-%d', t.due_at / 1000, 'unixepoch') END AS template_label,
						'text' AS template_task_kind, 1 AS template_required, p.email, p.name, e.name, e.slug, NULL AS reminder_copy
					FROM speaker_action_task_assignments a JOIN speaker_action_tasks t ON t.id = a.task_id AND t.event_id = a.event_id
					JOIN people p ON p.id = a.person_id JOIN events e ON e.id = a.event_id
					WHERE a.status = 'pending' AND a.event_id = ? AND e.mode <> 'demo'${personClause}
						${actionDueFilter.clause}
					ORDER BY person_id, event_id`,
			)
			.bind(args.eventId, ...selectedPeople, ...dueFilter.binds, args.eventId, ...selectedPeople, ...actionDueFilter.binds)
			.all<PendingTaskRow>();
		return result.results;
	}

	const result = await db
		.prepare(
			`SELECT
				st.person_id AS person_id,
				st.event_id AS event_id,
				st.template_key AS template_key,
				st.template_label AS template_label,
				st.template_task_kind AS template_task_kind,
				st.template_required AS template_required,
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
			WHERE st.status = 'pending' AND st.template_required = 1 AND e.mode <> 'demo'${personClause}${dueFilter.clause}
			UNION ALL
			SELECT a.person_id, a.event_id, 'speaker_action' AS template_key,
				t.title || CASE WHEN t.due_at IS NULL THEN '' ELSE ' — due ' || strftime('%Y-%m-%d', t.due_at / 1000, 'unixepoch') END AS template_label,
				'text' AS template_task_kind, 1 AS template_required, p.email, p.name, e.name, e.slug, NULL AS reminder_copy
			FROM speaker_action_task_assignments a JOIN speaker_action_tasks t ON t.id = a.task_id AND t.event_id = a.event_id
			JOIN people p ON p.id = a.person_id JOIN events e ON e.id = a.event_id
			WHERE a.status = 'pending' AND e.mode <> 'demo'${personClause}
				${actionDueFilter.clause}
			ORDER BY person_id, event_id`,
		)
		.bind(...selectedPeople, ...dueFilter.binds, ...selectedPeople, ...actionDueFilter.binds)
		.all<PendingTaskRow>();
	return result.results;
}

function groupByPersonEvent(rows: PendingTaskRow[]): PersonEventGroup[] {
	const map = new Map<string, PersonEventGroup>();
	for (const row of rows) {
		const key = `${row.person_id}:${row.event_id}`;
		const existing = map.get(key);
		if (existing) {
			existing.taskLabels.push(row.template_label || row.template_key);
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
			taskLabels: [row.template_label || row.template_key],
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
