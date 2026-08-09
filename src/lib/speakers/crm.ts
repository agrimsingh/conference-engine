export const SPEAKER_CRM_ACTIVITY_KINDS = ["note", "contact"] as const;

export type SpeakerCrmActivityKind = (typeof SPEAKER_CRM_ACTIVITY_KINDS)[number];
export type SpeakerCrmTimelineKind = SpeakerCrmActivityKind | "email" | "task_completed";

export type SpeakerCrmOwner = {
	accountId: string;
	name: string;
	email: string;
};

export type SpeakerCrmSummary = {
	owner: SpeakerCrmOwner | null;
	tags: string[];
	lastContactAt: number | null;
};

export type SpeakerCrmTimelineEntry = {
	id: string;
	kind: SpeakerCrmTimelineKind;
	body: string;
	occurredAt: number;
	authorName: string | null;
};

export type SpeakerCrmDetail = SpeakerCrmSummary & {
	timeline: SpeakerCrmTimelineEntry[];
};

export type SpeakerCrmOwnerOption = SpeakerCrmOwner;

type CrmProfileRow = {
	person_id: string;
	owner_account_id: string | null;
	owner_name: string | null;
	owner_email: string | null;
};

type CrmTagRow = {
	person_id: string;
	tag: string;
};

type TimestampRow = {
	person_id: string;
	occurred_at: number | null;
};

type ActivityRow = {
	id: string;
	kind: SpeakerCrmActivityKind;
	body: string;
	occurred_at: number;
	author_name: string | null;
	author_email: string | null;
};

type EmailTimelineRow = {
	id: string;
	subject: string;
	occurred_at: number;
};

type TaskTimelineRow = {
	id: string;
	label: string;
	occurred_at: number;
};

export type SpeakerCrmUpdateInput = {
	eventId: string;
	personId: string;
	ownerAccountId?: string | null;
	tags?: readonly string[];
	note?: string;
	contactNote?: string;
	authorAccountId: string | null;
	now: number;
};

export type SpeakerCrmUpdateResult =
	| { ok: true; detail: SpeakerCrmDetail }
	| { ok: false; error: string; status: 400 };

type NormalizedTags =
	| { ok: true; tags: string[] }
	| { ok: false; error: string };

const MAX_TAGS = 12;
const MAX_TAG_LENGTH = 48;
const MAX_ACTIVITY_LENGTH = 4_000;
const TIMELINE_LIMIT = 20;
// D1 permits at most 100 SQL variables. Each summary query also binds eventId.
const MAX_CRM_SUMMARY_PERSON_IDS_PER_QUERY = 99;

export function isSpeakerCrmActivityKind(value: unknown): value is SpeakerCrmActivityKind {
	return typeof value === "string" && (SPEAKER_CRM_ACTIVITY_KINDS as readonly string[]).includes(value);
}

export function normalizeSpeakerCrmTags(value: unknown): NormalizedTags {
	if (!Array.isArray(value) || value.some((tag) => typeof tag !== "string")) {
		return { ok: false, error: "Tags must be a list of text values" };
	}
	if (value.length > MAX_TAGS) return { ok: false, error: "Use up to 12 tags" };

	const seen = new Set<string>();
	const tags: string[] = [];
	for (const rawTag of value) {
		const tag = rawTag.trim();
		if (!tag) continue;
		if (tag.length > MAX_TAG_LENGTH) return { ok: false, error: "Tags must be 48 characters or fewer" };
		const canonical = tag.toLocaleLowerCase();
		if (!seen.has(canonical)) {
			seen.add(canonical);
			tags.push(tag);
		}
	}
	return { ok: true, tags };
}

export function normalizeSpeakerCrmActivity(value: unknown): string | null {
	if (typeof value !== "string") return null;
	const body = value.trim();
	if (!body || body.length > MAX_ACTIVITY_LENGTH) return null;
	return body;
}

export async function listSpeakerCrmOwners(
	db: D1Database,
	eventId: string,
): Promise<SpeakerCrmOwnerOption[]> {
	const rows = await db
		.prepare(
			`SELECT a.id AS account_id, a.name AS name, a.email AS email
			 FROM event_memberships m
			 JOIN accounts a ON a.id = m.account_id
			 WHERE m.event_id = ?
			 ORDER BY COALESCE(NULLIF(TRIM(a.name), ''), a.email), a.email`,
		)
		.bind(eventId)
		.all<{ account_id: string; name: string; email: string }>();
	return rows.results.map((row) => ({
		accountId: row.account_id,
		name: row.name.trim() || row.email,
		email: row.email,
	}));
}

export async function listSpeakerCrmSummaries(
	db: D1Database,
	eventId: string,
	personIds: readonly string[],
): Promise<Map<string, SpeakerCrmSummary>> {
	const uniquePersonIds = [...new Set(personIds)];
	const summaries = new Map<string, SpeakerCrmSummary>();
	for (const personId of uniquePersonIds) summaries.set(personId, emptySummary());
	if (!uniquePersonIds.length) return summaries;

	for (let start = 0; start < uniquePersonIds.length; start += MAX_CRM_SUMMARY_PERSON_IDS_PER_QUERY) {
		await mergeSpeakerCrmSummaryChunk(
			db,
			eventId,
			uniquePersonIds.slice(start, start + MAX_CRM_SUMMARY_PERSON_IDS_PER_QUERY),
			summaries,
		);
	}
	return summaries;
}

async function mergeSpeakerCrmSummaryChunk(
	db: D1Database,
	eventId: string,
	personIds: readonly string[],
	summaries: Map<string, SpeakerCrmSummary>,
): Promise<void> {
	const placeholders = personIds.map(() => "?").join(", ");
	const params = [eventId, ...personIds];
	const [profiles, tags, contacts, emails] = await Promise.all([
		db.prepare(
			`SELECT p.person_id, p.owner_account_id, a.name AS owner_name, a.email AS owner_email
			 FROM speaker_crm_profiles p
			 LEFT JOIN accounts a ON a.id = p.owner_account_id
			 WHERE p.event_id = ? AND p.person_id IN (${placeholders})`,
		).bind(...params).all<CrmProfileRow>(),
		db.prepare(
			`SELECT person_id, tag FROM speaker_crm_tags
			 WHERE event_id = ? AND person_id IN (${placeholders})
			 ORDER BY tag COLLATE NOCASE`,
		).bind(...params).all<CrmTagRow>(),
		db.prepare(
			`SELECT person_id, MAX(occurred_at) AS occurred_at
			 FROM speaker_crm_activities
			 WHERE event_id = ? AND kind = 'contact' AND person_id IN (${placeholders})
			 GROUP BY person_id`,
		).bind(...params).all<TimestampRow>(),
		db.prepare(
			`SELECT p.id AS person_id,
				MAX(COALESCE(d.sent_at, d.provider_accepted_at, d.updated_at)) AS occurred_at
			 FROM email_deliveries d
			 JOIN people p ON lower(p.email) = lower(d.to_email)
			 WHERE d.event_id = ?
				AND d.status IN ('provider_accepted', 'sent')
				AND p.id IN (${placeholders})
			 GROUP BY p.id`,
		).bind(...params).all<TimestampRow>(),
	]);

	for (const row of profiles.results) {
		const summary = summaries.get(row.person_id);
		if (!summary || !row.owner_account_id || !row.owner_email) continue;
		summary.owner = {
			accountId: row.owner_account_id,
			name: row.owner_name?.trim() || row.owner_email,
			email: row.owner_email,
		};
	}
	for (const row of tags.results) {
		const summary = summaries.get(row.person_id);
		if (summary) summary.tags.push(row.tag);
	}
	for (const row of [...contacts.results, ...emails.results]) {
		const summary = summaries.get(row.person_id);
			if (summary && typeof row.occurred_at === "number") {
				summary.lastContactAt = Math.max(summary.lastContactAt ?? 0, row.occurred_at);
			}
	}
}

export async function getSpeakerCrmDetail(
	db: D1Database,
	eventId: string,
	personId: string,
): Promise<SpeakerCrmDetail> {
	const summary = (await listSpeakerCrmSummaries(db, eventId, [personId])).get(personId) ?? emptySummary();
	const [activities, emails, tasks] = await Promise.all([
		db.prepare(
			`SELECT a.id, a.kind, a.body, a.occurred_at, author.name AS author_name, author.email AS author_email
			 FROM speaker_crm_activities a
			 LEFT JOIN accounts author ON author.id = a.author_account_id
			 WHERE a.event_id = ? AND a.person_id = ?
			 ORDER BY a.occurred_at DESC
			 LIMIT ?`,
		).bind(eventId, personId, TIMELINE_LIMIT).all<ActivityRow>(),
		db.prepare(
			`SELECT d.delivery_key AS id, d.subject, COALESCE(d.sent_at, d.provider_accepted_at, d.updated_at) AS occurred_at
			 FROM email_deliveries d
			 JOIN people p ON lower(p.email) = lower(d.to_email)
			 WHERE d.event_id = ? AND p.id = ? AND d.status IN ('provider_accepted', 'sent')
			 ORDER BY occurred_at DESC
			 LIMIT ?`,
		).bind(eventId, personId, TIMELINE_LIMIT).all<EmailTimelineRow>(),
		db.prepare(
			`SELECT id, COALESCE(NULLIF(TRIM(template_label), ''), template_key) AS label, completed_at AS occurred_at
			 FROM speaker_tasks
			 WHERE event_id = ? AND person_id = ? AND status = 'completed' AND completed_at IS NOT NULL
			 ORDER BY completed_at DESC
			 LIMIT ?`,
		).bind(eventId, personId, TIMELINE_LIMIT).all<TaskTimelineRow>(),
	]);

	const timeline: SpeakerCrmTimelineEntry[] = [
		...activities.results.map((row) => ({
			id: row.id,
			kind: row.kind,
			body: row.body,
			occurredAt: row.occurred_at,
			authorName: row.author_name?.trim() || row.author_email,
		})),
		...emails.results.map((row) => ({
			id: row.id,
			kind: "email" as const,
			body: `Email sent: ${row.subject}`,
			occurredAt: row.occurred_at,
			authorName: null,
		})),
		...tasks.results.map((row) => ({
			id: row.id,
			kind: "task_completed" as const,
			body: `Completed task: ${row.label}`,
			occurredAt: row.occurred_at,
			authorName: null,
		})),
	].sort((a, b) => b.occurredAt - a.occurredAt || timelineKindOrder(a.kind) - timelineKindOrder(b.kind) || a.id.localeCompare(b.id)).slice(0, TIMELINE_LIMIT);

	return { ...summary, timeline };
}

export async function updateSpeakerCrm(
	db: D1Database,
	input: SpeakerCrmUpdateInput,
): Promise<SpeakerCrmUpdateResult> {
	const tags = input.tags === undefined ? null : normalizeSpeakerCrmTags(input.tags);
	if (tags && !tags.ok) return { ok: false, error: tags.error, status: 400 };
	if (input.note !== undefined && !normalizeSpeakerCrmActivity(input.note)) {
		return { ok: false, error: "Internal notes must contain 1 to 4000 characters", status: 400 };
	}
	if (input.contactNote !== undefined && !normalizeSpeakerCrmActivity(input.contactNote)) {
		return { ok: false, error: "Contact notes must contain 1 to 4000 characters", status: 400 };
	}
	if (input.ownerAccountId) {
		const member = await db.prepare(
			"SELECT 1 AS found FROM event_memberships WHERE event_id = ? AND account_id = ?",
		).bind(input.eventId, input.ownerAccountId).first<{ found: number }>();
		if (!member) return { ok: false, error: "Owner must be an organizer for this event", status: 400 };
	}

	const statements = [
		db.prepare(
			`INSERT OR IGNORE INTO speaker_crm_profiles (event_id, person_id, owner_account_id, created_at, updated_at)
			 VALUES (?, ?, NULL, ?, ?)`,
		).bind(input.eventId, input.personId, input.now, input.now),
	];
	if (input.ownerAccountId !== undefined) {
		statements.push(db.prepare(
			"UPDATE speaker_crm_profiles SET owner_account_id = ?, updated_at = ? WHERE event_id = ? AND person_id = ?",
		).bind(input.ownerAccountId, input.now, input.eventId, input.personId));
	}
	if (tags?.ok) {
		statements.push(db.prepare(
			"DELETE FROM speaker_crm_tags WHERE event_id = ? AND person_id = ?",
		).bind(input.eventId, input.personId));
		for (const tag of tags.tags) {
			statements.push(db.prepare(
				"INSERT INTO speaker_crm_tags (event_id, person_id, tag, created_at) VALUES (?, ?, ?, ?)",
			).bind(input.eventId, input.personId, tag, input.now));
		}
	}
	for (const activity of [
		{ kind: "note" as const, body: input.note },
		{ kind: "contact" as const, body: input.contactNote },
	]) {
		const body = normalizeSpeakerCrmActivity(activity.body);
		if (body) {
			statements.push(db.prepare(
				`INSERT INTO speaker_crm_activities (
					id, event_id, person_id, kind, body, author_account_id, occurred_at, created_at
				) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
			).bind(
				crypto.randomUUID(),
				input.eventId,
				input.personId,
				activity.kind,
				body,
				input.authorAccountId,
				input.now,
				input.now,
			));
		}
	}
	await db.batch(statements);
	return { ok: true, detail: await getSpeakerCrmDetail(db, input.eventId, input.personId) };
}

function emptySummary(): SpeakerCrmSummary {
	return { owner: null, tags: [], lastContactAt: null };
}

function timelineKindOrder(kind: SpeakerCrmTimelineKind): number {
	switch (kind) {
		case "contact":
			return 0;
		case "note":
			return 1;
		case "task_completed":
			return 2;
		case "email":
			return 3;
		default: {
			const _exhaustive: never = kind;
			return _exhaustive;
		}
	}
}
