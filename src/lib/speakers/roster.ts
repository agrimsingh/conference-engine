import type { EventSpeakerProfileRow } from "@/lib/db/types";
import { getEventById } from "@/lib/db/queries";
import { sendTaskReminders, type ReminderEnv, type ReminderRunResult } from "@/lib/email/reminders";
import { sendTemplatedEmail } from "@/lib/email/resend";
import {
	isRosterBulkEmailKey,
	renderStoredMessageTemplate,
	type RosterBulkEmailKey,
} from "@/lib/email/templates";
import { DemoEventWriteError, requireWritableEventById } from "@/lib/events/writability";
import { isPlausibleEmail, normalizeEmail } from "@/lib/security/crypto";
import { validatedAppOrigin } from "@/lib/security/origin";
import { hasFormulaPrefix, parseBoundedCsv } from "@/lib/sessions/csv";
import { listSpeakerCrmSummaries, type SpeakerCrmSummary } from "./crm";
import { SPEAKER_SOCIAL_KEYS, type SpeakerSocialKey, type SpeakerSocialLinks } from "./social";

export type { EventSpeakerProfileRow };

/**
 * Roster membership query (documented for eval):
 *
 * Include a person when any of:
 * 1. They appear on submission_speakers for this event with status confirmed|pending
 *    and the submission is in the accepted pipeline (accepted|scheduled|published), OR
 * 2. They are a confirmed speaker on a live proposal (submitted|under_review|waitlisted), OR
 * 3. They already have an event_speaker_profiles row for this event (manual add / import).
 *
 * Exclude declined|removed speaker rows and draft|rejected|withdrawn submissions
 * unless the person still has a durable event_speaker_profiles row.
 *
 * Contact fields (job_title, company, social_json, display_name) are read from
 * speaker_profiles (portal SoT). event_speaker_profiles owns workflow_status;
 * its job/company/social columns are legacy fallbacks only (COALESCE).
 */

export const SPEAKER_WORKFLOW_STATUSES = ["invited", "confirmed", "declined", "withdrawn"] as const;
export type SpeakerWorkflowStatus = (typeof SPEAKER_WORKFLOW_STATUSES)[number];

export const SOCIAL_KEYS = SPEAKER_SOCIAL_KEYS;
export type SocialKey = SpeakerSocialKey;
export type SpeakerSocials = SpeakerSocialLinks;

export type RosterTaskSummary = {
	id: string;
	templateKey: string;
	label: string;
	status: "pending" | "completed";
	dueAt: number | null;
	submissionId: string;
};

export type RosterSpeaker = {
	personId: string;
	email: string;
	name: string;
	jobTitle: string | null;
	company: string | null;
	salutation: string | null;
	pronouns: string | null;
	honorific: string | null;
	bio: string | null;
	logisticsText: string | null;
	headshot: { assetId: string; filename: string | null; uploadedAt: number } | null;
	socials: SpeakerSocials;
	workflowStatus: SpeakerWorkflowStatus;
	submissionStatuses: string[];
	submissionIds: string[];
	pendingTaskCount: number;
	tasks: RosterTaskSummary[];
	earliestDueAt: number | null;
	profileId: string | null;
	crm: SpeakerCrmSummary;
};

export type RosterFilters = {
	status?: SpeakerWorkflowStatus | "all";
	q?: string;
};

type LinkedSpeakerRow = {
	person_id: string;
	email: string;
	name: string | null;
	speaker_status: "pending" | "confirmed" | "declined" | "removed";
	submission_status: string;
	submission_id: string;
	job_title: string | null;
	company: string | null;
	salutation: string | null;
	pronouns: string | null;
	honorific: string | null;
	bio: string | null;
	logistics_text: string | null;
	headshot_asset_id: string | null;
	headshot_filename: string | null;
	headshot_created_at: number | null;
	social_json: string | null;
	workflow_status: SpeakerWorkflowStatus | null;
	profile_id: string | null;
};

type ProfileOnlyRow = {
	person_id: string;
	email: string;
	name: string | null;
	job_title: string | null;
	company: string | null;
	salutation: string | null;
	pronouns: string | null;
	honorific: string | null;
	bio: string | null;
	logistics_text: string | null;
	headshot_asset_id: string | null;
	headshot_filename: string | null;
	headshot_created_at: number | null;
	social_json: string | null;
	workflow_status: SpeakerWorkflowStatus;
	profile_id: string;
};

type TaskRow = {
	id: string;
	person_id: string;
	submission_id: string;
	template_key: string;
	template_label: string | null;
	status: "pending" | "completed";
	due_at: number | null;
};

export function isSpeakerWorkflowStatus(value: unknown): value is SpeakerWorkflowStatus {
	return typeof value === "string" && (SPEAKER_WORKFLOW_STATUSES as readonly string[]).includes(value);
}

export function parseSpeakerSocials(raw: string | null | undefined): SpeakerSocials {
	if (!raw?.trim()) return {};
	try {
		const parsed: unknown = JSON.parse(raw);
		if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
		const out: SpeakerSocials = {};
		for (const key of SOCIAL_KEYS) {
			const value = (parsed as Record<string, unknown>)[key];
			if (typeof value === "string" && value.trim()) out[key] = value.trim().slice(0, 500);
		}
		return out;
	} catch {
		return {};
	}
}

export function serializeSpeakerSocials(socials: SpeakerSocials): string | null {
	const cleaned: SpeakerSocials = {};
	for (const key of SOCIAL_KEYS) {
		const value = socials[key]?.trim();
		if (value) cleaned[key] = value.slice(0, 500);
	}
	return Object.keys(cleaned).length ? JSON.stringify(cleaned) : null;
}

/** Map co-speaker confirmation state onto organizer workflow when no profile exists. */
export function deriveWorkflowStatus(
	speakerStatus: LinkedSpeakerRow["speaker_status"],
): SpeakerWorkflowStatus {
	switch (speakerStatus) {
		case "confirmed":
			return "confirmed";
		case "declined":
			return "declined";
		case "removed":
			return "withdrawn";
		case "pending":
			return "invited";
		default: {
			const _exhaustive: never = speakerStatus;
			return _exhaustive;
		}
	}
}

export function matchesRosterSearch(speaker: RosterSpeaker, q: string | undefined): boolean {
	const needle = q?.trim().toLowerCase();
	if (!needle) return true;
	const haystack = [
		speaker.name,
		speaker.email,
		speaker.jobTitle ?? "",
		speaker.company ?? "",
		speaker.salutation ?? "",
		speaker.pronouns ?? "",
		speaker.honorific ?? "",
		...Object.values(speaker.socials),
	]
		.join(" ")
		.toLowerCase();
	return haystack.includes(needle);
}

export function filterRosterSpeakers(
	speakers: RosterSpeaker[],
	filters: RosterFilters,
): RosterSpeaker[] {
	const status = filters.status ?? "all";
	return speakers.filter((speaker) => {
		if (status !== "all" && speaker.workflowStatus !== status) return false;
		return matchesRosterSearch(speaker, filters.q);
	});
}

/** Explicit bulk selections are all-or-nothing and must belong to this event roster. */
export function rosterContainsEveryRecipient(speakers: RosterSpeaker[], personIds: string[]): boolean {
	const rosterIds = new Set(speakers.map((speaker) => speaker.personId));
	return personIds.every((personId) => rosterIds.has(personId));
}

export async function validateRosterRecipientSelection(db: D1Database, eventId: string, personIds: string[]): Promise<boolean> {
	return rosterContainsEveryRecipient(await listEventSpeakerRoster(db, eventId), personIds);
}

let dueAtColumnCache: boolean | null = null;

export async function speakerTasksHaveDueAt(db: D1Database): Promise<boolean> {
	if (dueAtColumnCache !== null) return dueAtColumnCache;
	const info = await db.prepare("PRAGMA table_info(speaker_tasks)").all<{ name: string }>();
	dueAtColumnCache = info.results.some((column) => column.name === "due_at");
	return dueAtColumnCache;
}

/** Test helper: clear PRAGMA cache between cases. */
export function resetSpeakerTasksDueAtCache(): void {
	dueAtColumnCache = null;
}

export async function listEventSpeakerRoster(
	db: D1Database,
	eventId: string,
	filters: RosterFilters = {},
): Promise<RosterSpeaker[]> {
	const [linked, profiles, hasDueAt] = await Promise.all([
		db
			.prepare(
				`SELECT
					p.id AS person_id,
					p.email AS email,
					COALESCE(NULLIF(TRIM(sp.display_name), ''), p.name) AS name,
					ss.status AS speaker_status,
					s.status AS submission_status,
					s.id AS submission_id,
					COALESCE(sp.job_title, esp.job_title) AS job_title,
					COALESCE(sp.company, esp.company) AS company,
					sp.salutation AS salutation,
					sp.pronouns AS pronouns,
					sp.honorific AS honorific,
					sp.bio AS bio,
					sp.logistics_text AS logistics_text,
					sp.headshot_asset_id AS headshot_asset_id,
					ha.filename AS headshot_filename,
					ha.created_at AS headshot_created_at,
					COALESCE(sp.social_json, esp.social_json) AS social_json,
					esp.workflow_status AS workflow_status,
					esp.id AS profile_id
				 FROM submission_speakers ss
				 JOIN submissions s ON s.id = ss.submission_id
				 JOIN people p ON p.id = ss.person_id
				 LEFT JOIN event_speaker_profiles esp
				   ON esp.event_id = s.event_id AND esp.person_id = p.id
				 LEFT JOIN speaker_profiles sp
				   ON sp.event_id = s.event_id AND sp.person_id = p.id
				 LEFT JOIN assets ha ON ha.id = sp.headshot_asset_id AND ha.event_id = s.event_id
				 WHERE s.event_id = ?
				   AND ss.person_id IS NOT NULL
				   AND ss.status IN ('confirmed', 'pending')
				   AND (
				     s.status IN ('accepted', 'scheduled', 'published')
				     OR (ss.status = 'confirmed' AND s.status IN ('submitted', 'under_review', 'waitlisted'))
				   )`,
			)
			.bind(eventId)
			.all<LinkedSpeakerRow>(),
		db
			.prepare(
				`SELECT
					p.id AS person_id,
					p.email AS email,
					COALESCE(NULLIF(TRIM(sp.display_name), ''), p.name) AS name,
					COALESCE(sp.job_title, esp.job_title) AS job_title,
					COALESCE(sp.company, esp.company) AS company,
					sp.salutation AS salutation,
					sp.pronouns AS pronouns,
					sp.honorific AS honorific,
					sp.bio AS bio,
					sp.logistics_text AS logistics_text,
					sp.headshot_asset_id AS headshot_asset_id,
					ha.filename AS headshot_filename,
					ha.created_at AS headshot_created_at,
					COALESCE(sp.social_json, esp.social_json) AS social_json,
					esp.workflow_status AS workflow_status,
					esp.id AS profile_id
				 FROM event_speaker_profiles esp
				 JOIN people p ON p.id = esp.person_id
				 LEFT JOIN speaker_profiles sp
				   ON sp.event_id = esp.event_id AND sp.person_id = esp.person_id
				 LEFT JOIN assets ha ON ha.id = sp.headshot_asset_id AND ha.event_id = esp.event_id
				 WHERE esp.event_id = ?`,
			)
			.bind(eventId)
			.all<ProfileOnlyRow>(),
		speakerTasksHaveDueAt(db),
	]);

	const taskSql = hasDueAt
		? `SELECT id, person_id, submission_id, template_key, template_label, status, due_at
		   FROM speaker_tasks WHERE event_id = ?`
		: `SELECT id, person_id, submission_id, template_key, template_label, status, NULL AS due_at
		   FROM speaker_tasks WHERE event_id = ?`;
	const tasks = await db.prepare(taskSql).bind(eventId).all<TaskRow>();

	const byPerson = new Map<string, RosterSpeaker>();

	function ensure(row: {
		person_id: string;
		email: string;
		name: string | null;
		job_title: string | null;
		company: string | null;
		salutation: string | null;
		pronouns: string | null;
		honorific: string | null;
		bio: string | null;
		logistics_text: string | null;
		headshot_asset_id: string | null;
		headshot_filename: string | null;
		headshot_created_at: number | null;
		social_json: string | null;
		workflow_status: SpeakerWorkflowStatus | null;
		profile_id: string | null;
		fallbackStatus: SpeakerWorkflowStatus;
	}): RosterSpeaker {
		const existing = byPerson.get(row.person_id);
		if (existing) {
			if (row.profile_id && !existing.profileId) {
				existing.profileId = row.profile_id;
				existing.jobTitle = row.job_title;
				existing.company = row.company;
				existing.salutation = row.salutation;
				existing.pronouns = row.pronouns;
				existing.honorific = row.honorific;
				existing.bio = row.bio;
				existing.logisticsText = row.logistics_text;
				existing.headshot = row.headshot_asset_id ? { assetId: row.headshot_asset_id, filename: row.headshot_filename, uploadedAt: row.headshot_created_at ?? 0 } : null;
				existing.socials = parseSpeakerSocials(row.social_json);
				existing.workflowStatus = row.workflow_status ?? existing.workflowStatus;
			}
			if (row.name?.trim() && !existing.name.trim()) existing.name = row.name.trim();
			return existing;
		}
		const speaker: RosterSpeaker = {
			personId: row.person_id,
			email: row.email,
			name: row.name?.trim() || row.email,
			jobTitle: row.job_title,
			company: row.company,
			salutation: row.salutation,
			pronouns: row.pronouns,
			honorific: row.honorific,
			bio: row.bio,
			logisticsText: row.logistics_text,
			headshot: row.headshot_asset_id ? { assetId: row.headshot_asset_id, filename: row.headshot_filename, uploadedAt: row.headshot_created_at ?? 0 } : null,
			socials: parseSpeakerSocials(row.social_json),
			workflowStatus: row.workflow_status ?? row.fallbackStatus,
			submissionStatuses: [],
			submissionIds: [],
			pendingTaskCount: 0,
			tasks: [],
			earliestDueAt: null,
			profileId: row.profile_id,
			crm: { owner: null, tags: [], lastContactAt: null },
		};
		byPerson.set(row.person_id, speaker);
		return speaker;
	}

	for (const row of linked.results) {
		const speaker = ensure({
			...row,
			fallbackStatus: deriveWorkflowStatus(row.speaker_status),
		});
		if (!speaker.submissionIds.includes(row.submission_id)) {
			speaker.submissionIds.push(row.submission_id);
		}
		if (!speaker.submissionStatuses.includes(row.submission_status)) {
			speaker.submissionStatuses.push(row.submission_status);
		}
		if (row.name?.trim() && speaker.name === speaker.email) {
			speaker.name = row.name.trim();
		}
	}

	for (const row of profiles.results) {
		ensure({
			...row,
			fallbackStatus: row.workflow_status,
		});
	}

	const tasksByPerson = new Map<string, RosterTaskSummary[]>();
	for (const task of tasks.results) {
		const summary: RosterTaskSummary = {
			id: task.id,
			templateKey: task.template_key,
			label: task.template_label?.trim() || task.template_key,
			status: task.status,
			dueAt: typeof task.due_at === "number" ? task.due_at : null,
			submissionId: task.submission_id,
		};
		const list = tasksByPerson.get(task.person_id) ?? [];
		list.push(summary);
		tasksByPerson.set(task.person_id, list);
	}

	for (const speaker of byPerson.values()) {
		const personTasks = tasksByPerson.get(speaker.personId) ?? [];
		speaker.tasks = personTasks.sort((a, b) => {
			const aDue = a.dueAt ?? Number.POSITIVE_INFINITY;
			const bDue = b.dueAt ?? Number.POSITIVE_INFINITY;
			return aDue - bDue || a.label.localeCompare(b.label);
		});
		speaker.pendingTaskCount = personTasks.filter((task) => task.status === "pending").length;
		const dues = personTasks
			.filter((task) => task.status === "pending" && task.dueAt !== null)
			.map((task) => task.dueAt as number);
		speaker.earliestDueAt = dues.length ? Math.min(...dues) : null;
	}

	const crmSummaries = await listSpeakerCrmSummaries(db, eventId, [...byPerson.keys()]);
	for (const speaker of byPerson.values()) {
		speaker.crm = crmSummaries.get(speaker.personId) ?? { owner: null, tags: [], lastContactAt: null };
	}

	const ordered = [...byPerson.values()].sort((a, b) =>
		a.name.localeCompare(b.name, undefined, { sensitivity: "base" })
		|| a.email.localeCompare(b.email),
	);
	return filterRosterSpeakers(ordered, filters);
}

export type UpsertRosterSpeakerInput = {
	email: string;
	name: string;
	jobTitle?: string | null;
	company?: string | null;
	bio?: string | null;
	logisticsText?: string | null;
	socials?: SpeakerSocials;
	workflowStatus?: SpeakerWorkflowStatus;
};

export type UpsertRosterSpeakerResult =
	| { ok: true; speaker: RosterSpeaker }
	| { ok: false; error: string; status: number };

async function ensurePerson(
	db: D1Database,
	email: string,
	name: string,
	now: number,
): Promise<{ id: string; email: string; name: string | null }> {
	const existing = await db.prepare("SELECT id, email, name FROM people WHERE email = ?").bind(email).first<{
		id: string;
		email: string;
		name: string | null;
	}>();
	if (existing) {
		if (name.trim() && existing.name !== name.trim()) {
			await db.prepare("UPDATE people SET name = ? WHERE id = ? AND (name IS NULL OR name = '')").bind(name.trim(), existing.id).run();
			return { ...existing, name: existing.name?.trim() || name.trim() };
		}
		return existing;
	}
	const id = crypto.randomUUID();
	await db
		.prepare("INSERT INTO people (id, email, name, created_at) VALUES (?, ?, ?, ?)")
		.bind(id, email, name.trim() || null, now)
		.run();
	return { id, email, name: name.trim() || null };
}

export async function upsertEventSpeakerProfile(
	db: D1Database,
	args: {
		eventId: string;
		personId?: string;
		input: UpsertRosterSpeakerInput;
		now?: number;
	},
): Promise<UpsertRosterSpeakerResult> {
	try {
		await requireWritableEventById(db, args.eventId);
	} catch (error) {
		if (error instanceof DemoEventWriteError) {
			return { ok: false, error: "This demo event is read-only", status: 403 };
		}
		throw error;
	}

	const email = normalizeEmail(args.input.email);
	const name = args.input.name.trim();
	if (!isPlausibleEmail(email)) return { ok: false, error: "Enter a valid email address", status: 400 };
	if (!name || name.length > 160) return { ok: false, error: "Name must be between 1 and 160 characters", status: 400 };
	const jobTitle = args.input.jobTitle?.trim() || null;
	const company = args.input.company?.trim() || null;
	const bio = args.input.bio?.trim() || null;
	const logisticsText = args.input.logisticsText?.trim() || null;
	if (jobTitle && jobTitle.length > 160) return { ok: false, error: "Job title is too long", status: 400 };
	if (company && company.length > 160) return { ok: false, error: "Company is too long", status: 400 };
	if (bio && bio.length > 10_000) return { ok: false, error: "Bio is too long", status: 400 };
	if (logisticsText && logisticsText.length > 4000) return { ok: false, error: "Travel and logistics is too long", status: 400 };
	const workflowStatus = args.input.workflowStatus ?? "invited";
	if (!isSpeakerWorkflowStatus(workflowStatus)) {
		return { ok: false, error: "Invalid workflow status", status: 400 };
	}
	const socialJson = serializeSpeakerSocials(args.input.socials ?? {});
	const now = args.now ?? Date.now();

	let personId = args.personId;
	if (personId) {
		const person = await db.prepare("SELECT id, email, name FROM people WHERE id = ?").bind(personId).first<{
			id: string;
			email: string;
			name: string | null;
		}>();
		if (!person) return { ok: false, error: "Speaker not found", status: 404 };
		if (person.email !== email) {
			const clash = await db.prepare("SELECT id FROM people WHERE email = ? AND id != ?").bind(email, personId).first();
			if (clash) return { ok: false, error: "Another person already uses that email", status: 409 };
			await db.prepare("UPDATE people SET email = ?, name = ? WHERE id = ?").bind(email, name, personId).run();
		} else if (person.name !== name) {
			await db.prepare("UPDATE people SET name = ? WHERE id = ?").bind(name, personId).run();
		}
	} else {
		const person = await ensurePerson(db, email, name, now);
		personId = person.id;
	}

	await db
		.prepare(
			`INSERT INTO speaker_profiles (
				id, event_id, person_id, display_name, bio, job_title, company, social_json,
				headshot_asset_id, logistics_text, created_at, updated_at
			) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?)
			ON CONFLICT(event_id, person_id) DO UPDATE SET
				display_name = excluded.display_name,
				bio = excluded.bio,
				job_title = excluded.job_title,
				company = excluded.company,
				social_json = excluded.social_json,
				logistics_text = excluded.logistics_text,
				updated_at = excluded.updated_at`,
		)
		.bind(
			crypto.randomUUID(),
			args.eventId,
			personId,
			name,
			bio,
			jobTitle,
			company,
			socialJson,
			logisticsText,
			now,
			now,
		)
		.run();

	const existing = await db
		.prepare("SELECT id FROM event_speaker_profiles WHERE event_id = ? AND person_id = ?")
		.bind(args.eventId, personId)
		.first<{ id: string }>();
	if (existing) {
		await db
			.prepare(
				`UPDATE event_speaker_profiles
				 SET job_title = NULL, company = NULL, social_json = NULL, workflow_status = ?, updated_at = ?
				 WHERE id = ?`,
			)
			.bind(workflowStatus, now, existing.id)
			.run();
	} else {
		await db
			.prepare(
				`INSERT INTO event_speaker_profiles (
					id, event_id, person_id, job_title, company, social_json, workflow_status, created_at, updated_at
				) VALUES (?, ?, ?, NULL, NULL, NULL, ?, ?, ?)`,
			)
			.bind(crypto.randomUUID(), args.eventId, personId, workflowStatus, now, now)
			.run();
	}

	const roster = await listEventSpeakerRoster(db, args.eventId);
	const speaker = roster.find((row) => row.personId === personId);
	if (!speaker) return { ok: false, error: "Speaker upsert failed", status: 500 };
	return { ok: true, speaker };
}

export type RosterBulkEmailInput = {
	eventId: string;
	personIds: string[];
	templateKey?: RosterBulkEmailKey;
	subject?: string;
	text?: string;
	now?: number;
};

export function resolveRosterBulkEmailTemplateKey(value: unknown): RosterBulkEmailKey | null {
	if (value === undefined || value === null) return "task_reminder";
	if (typeof value !== "string" || !isRosterBulkEmailKey(value)) return null;
	return value;
}

export async function emailRosterSpeakers(
	env: ReminderEnv,
	args: RosterBulkEmailInput,
): Promise<ReminderRunResult & { error?: string; templateKey?: RosterBulkEmailKey }> {
	if (args.personIds.length === 0) return { sent: 0, skipped: 0, error: "No recipients" };
	if (args.personIds.length > 100) return { sent: 0, skipped: 0, error: "At most 100 recipients per send" };
	const templateKey = args.templateKey ?? "task_reminder";
	const now = args.now ?? Date.now();

	if (templateKey === "task_reminder") {
		const result = await sendTaskReminders(env, {
			eventId: args.eventId,
			personIds: args.personIds,
			now,
			dueMode: "all_pending",
		});
		return { ...result, templateKey };
	}

	const subject = args.subject?.trim() ?? "";
	const text = args.text?.trim() ?? "";
	if (!subject || !text) {
		return { sent: 0, skipped: 0, error: "subject and text are required for speaker_announcement", templateKey };
	}
	if (subject.length > 500 || text.length > 20_000) {
		return { sent: 0, skipped: 0, error: "Announcement subject or body is too long", templateKey };
	}

	const event = await getEventById(env.DB, args.eventId);
	if (!event) return { sent: 0, skipped: 0, error: "Event not found", templateKey };
	const portalOrigin = validatedAppOrigin(env.APP_ORIGIN);
	if (!portalOrigin) {
		return {
			sent: 0,
			skipped: args.personIds.length,
			configurationError: "APP_ORIGIN must be an absolute http(s) origin without a path",
			templateKey,
		};
	}
	if (!env.AUTH_SECRET) {
		return {
			sent: 0,
			skipped: args.personIds.length,
			configurationError: "AUTH_SECRET is required for durable reminder delivery",
			templateKey,
		};
	}

	const people = await env.DB
		.prepare(
			`SELECT id, email, name FROM people WHERE id IN (${args.personIds.map(() => "?").join(", ")})`,
		)
		.bind(...args.personIds)
		.all<{ id: string; email: string; name: string | null }>();
	const byId = new Map(people.results.map((row) => [row.id, row]));

	let sent = 0;
	let skipped = 0;
	for (const personId of args.personIds) {
		const person = byId.get(personId);
		if (!person?.email) {
			skipped += 1;
			continue;
		}
		const submitterName = person.name?.trim() || "there";
		const context = {
			eventName: event.name,
			submitterName,
			title: text,
			portalHint: `Sign in at ${portalOrigin}/portal`,
			portalUrl: `${portalOrigin}/portal`,
		};
		const rendered = renderStoredMessageTemplate({ subject, text }, context);
		const sendResult = await sendTemplatedEmail(env.DB, {
			eventId: args.eventId,
			submissionId: null,
			toEmail: person.email,
			templateKey: "speaker_announcement",
			context,
			override: rendered,
			deliveryScope: `roster-announcement:${subject}`,
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

	return { sent, skipped, templateKey };
}

export type RosterImportResult =
	| { ok: true; imported: number; updated: number; rows: Array<{ row: number; email: string; action: "created" | "updated" }> }
	| { ok: false; error: string; rows?: Array<{ row: number; error: string }> };

export async function importSpeakerRosterCsv(
	db: D1Database,
	args: { eventId: string; csv: string; now?: number },
): Promise<RosterImportResult> {
	try {
		await requireWritableEventById(db, args.eventId);
	} catch (error) {
		if (error instanceof DemoEventWriteError) {
			return { ok: false, error: "This demo event is read-only" };
		}
		throw error;
	}

	const parsed = parseBoundedCsv(args.csv);
	if (!parsed.ok) return { ok: false, error: parsed.error };
	const required = ["email", "name"];
	for (const header of required) {
		if (!parsed.headers.includes(header)) {
			return { ok: false, error: `CSV requires a ${header} column` };
		}
	}

	const issues: Array<{ row: number; error: string }> = [];
	const actions: Array<{ row: number; email: string; action: "created" | "updated" }> = [];
	let imported = 0;
	let updated = 0;

	for (const [index, record] of parsed.rows.entries()) {
		const rowNumber = index + 2;
		const email = normalizeEmail(record.email ?? "");
		const name = (record.name ?? "").trim();
		const jobTitle = (record.job_title ?? record["job title"] ?? "").trim();
		const company = (record.company ?? "").trim();
		const bio = (record.bio ?? "").trim();
		const logisticsText = (record.logistics ?? record.travel ?? "").trim();
		const workflowRaw = (record.workflow_status ?? record.status ?? "invited").trim().toLowerCase();
		const socials: SpeakerSocials = {};
		for (const key of SOCIAL_KEYS) {
			const value = (record[key] ?? "").trim();
			if (value) socials[key] = value;
		}
		if (hasFormulaPrefix(name) || hasFormulaPrefix(email) || hasFormulaPrefix(jobTitle) || hasFormulaPrefix(company) || hasFormulaPrefix(bio) || hasFormulaPrefix(logisticsText)) {
			issues.push({ row: rowNumber, error: "Formula-like values are not allowed" });
			continue;
		}
		if (!isPlausibleEmail(email) || !name) {
			issues.push({ row: rowNumber, error: "Name and valid email are required" });
			continue;
		}
		if (!isSpeakerWorkflowStatus(workflowRaw)) {
			issues.push({ row: rowNumber, error: `workflow_status must be one of ${SPEAKER_WORKFLOW_STATUSES.join(", ")}` });
			continue;
		}
		const existed = await db
			.prepare(
				`SELECT esp.id FROM event_speaker_profiles esp
				 JOIN people p ON p.id = esp.person_id
				 WHERE esp.event_id = ? AND p.email = ?`,
			)
			.bind(args.eventId, email)
			.first();
		const result = await upsertEventSpeakerProfile(db, {
			eventId: args.eventId,
			input: {
				email,
				name,
				jobTitle: jobTitle || null,
				company: company || null,
				bio: bio || null,
				logisticsText: logisticsText || null,
				socials,
				workflowStatus: workflowRaw,
			},
			now: args.now,
		});
		if (!result.ok) {
			issues.push({ row: rowNumber, error: result.error });
			continue;
		}
		if (existed) {
			updated += 1;
			actions.push({ row: rowNumber, email, action: "updated" });
		} else {
			imported += 1;
			actions.push({ row: rowNumber, email, action: "created" });
		}
	}

	if (issues.length) return { ok: false, error: "Fix CSV validation errors before importing", rows: issues };
	return { ok: true, imported, updated, rows: actions };
}
