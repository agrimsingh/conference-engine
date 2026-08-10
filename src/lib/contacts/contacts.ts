import { isPlausibleEmail, normalizeEmail } from "@/lib/security/crypto";
import {
	isContactPipelineStage,
	type AccountContact,
	type ContactActivity,
	type ContactCustomFields,
	type ContactDetail,
	type ContactEventLink,
	type ContactFilters,
	type ContactKpis,
	type ContactStageHistoryEntry,
} from "./types";

const MAX_TAGS = 12;
const MAX_TAG_LENGTH = 48;
const MAX_NOTES = 8_000;
const MAX_BIO = 10_000;
const MAX_NAME = 160;
const MAX_TITLE = 160;
const MAX_COMPANY = 160;
const MAX_ACTIVITY = 4_000;

type ContactRow = {
	id: string;
	account_id: string;
	email: string;
	name: string;
	title: string | null;
	company: string | null;
	bio: string | null;
	notes: string | null;
	custom_fields_json: string;
	created_at: number;
	updated_at: number;
	stage: string | null;
};

type TagRow = { contact_id: string; tag: string };

export type ContactWriteResult<T> =
	| { ok: true; value: T }
	| { ok: false; error: string; status: number };

export function parseCustomFields(raw: string | null | undefined): ContactCustomFields {
	if (!raw?.trim()) return {};
	try {
		const parsed: unknown = JSON.parse(raw);
		if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
		const out: ContactCustomFields = {};
		for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
			if (typeof value === "string" && key.trim()) {
				out[key.trim().slice(0, 64)] = value.trim().slice(0, 500);
			}
		}
		return out;
	} catch {
		return {};
	}
}

export function normalizeContactTags(value: unknown): ContactWriteResult<string[]> {
	if (!Array.isArray(value) || value.some((tag) => typeof tag !== "string")) {
		return { ok: false, error: "Tags must be a list of text values", status: 400 };
	}
	if (value.length > MAX_TAGS) return { ok: false, error: "Use up to 12 tags", status: 400 };
	const seen = new Set<string>();
	const tags: string[] = [];
	for (const raw of value) {
		const tag = raw.trim();
		if (!tag) continue;
		if (tag.length > MAX_TAG_LENGTH) {
			return { ok: false, error: "Tags must be 48 characters or fewer", status: 400 };
		}
		const key = tag.toLocaleLowerCase();
		if (!seen.has(key)) {
			seen.add(key);
			tags.push(tag);
		}
	}
	return { ok: true, value: tags };
}

function mapContact(row: ContactRow, tags: string[]): AccountContact {
	return {
		id: row.id,
		accountId: row.account_id,
		email: row.email,
		name: row.name,
		title: row.title,
		company: row.company,
		bio: row.bio,
		notes: row.notes,
		customFields: parseCustomFields(row.custom_fields_json),
		tags,
		stage: isContactPipelineStage(row.stage) ? row.stage : null,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	};
}

async function loadTagsForContacts(
	db: D1Database,
	accountId: string,
	contactIds: readonly string[],
): Promise<Map<string, string[]>> {
	const map = new Map<string, string[]>();
	for (const id of contactIds) map.set(id, []);
	if (!contactIds.length) return map;
	const placeholders = contactIds.map(() => "?").join(", ");
	const rows = await db
		.prepare(
			`SELECT contact_id, tag FROM account_contact_tags
			 WHERE account_id = ? AND contact_id IN (${placeholders})
			 ORDER BY tag COLLATE NOCASE`,
		)
		.bind(accountId, ...contactIds)
		.all<TagRow>();
	for (const row of rows.results) {
		map.get(row.contact_id)?.push(row.tag);
	}
	return map;
}

export async function listAccountContacts(
	db: D1Database,
	accountId: string,
	filters: ContactFilters = {},
): Promise<AccountContact[]> {
	const clauses = ["c.account_id = ?"];
	const binds: Array<string> = [accountId];

	const q = filters.q?.trim();
	if (q) {
		clauses.push(
			`(c.name LIKE ? COLLATE NOCASE OR c.email LIKE ? COLLATE NOCASE OR IFNULL(c.company, '') LIKE ? COLLATE NOCASE OR IFNULL(c.title, '') LIKE ? COLLATE NOCASE)`,
		);
		const like = `%${q.replace(/[%_]/g, "")}%`;
		binds.push(like, like, like, like);
	}
	const company = filters.company?.trim();
	if (company) {
		clauses.push(`c.company = ? COLLATE NOCASE`);
		binds.push(company);
	}
	const title = filters.title?.trim();
	if (title) {
		clauses.push(`c.title = ? COLLATE NOCASE`);
		binds.push(title);
	}
	const tag = filters.tag?.trim();
	if (tag) {
		clauses.push(
			`EXISTS (SELECT 1 FROM account_contact_tags t WHERE t.contact_id = c.id AND t.account_id = c.account_id AND t.tag = ? COLLATE NOCASE)`,
		);
		binds.push(tag);
	}
	if (filters.stage && filters.stage !== "all") {
		clauses.push(`p.stage = ?`);
		binds.push(filters.stage);
	}

	const rows = await db
		.prepare(
			`SELECT c.*, p.stage AS stage
			 FROM account_contacts c
			 LEFT JOIN account_contact_pipeline p ON p.contact_id = c.id
			 WHERE ${clauses.join(" AND ")}
			 ORDER BY c.name COLLATE NOCASE, c.email COLLATE NOCASE`,
		)
		.bind(...binds)
		.all<ContactRow>();

	const tags = await loadTagsForContacts(
		db,
		accountId,
		rows.results.map((row) => row.id),
	);
	return rows.results.map((row) => mapContact(row, tags.get(row.id) ?? []));
}

export async function getAccountContact(
	db: D1Database,
	accountId: string,
	contactId: string,
): Promise<ContactDetail | null> {
	const row = await db
		.prepare(
			`SELECT c.*, p.stage AS stage
			 FROM account_contacts c
			 LEFT JOIN account_contact_pipeline p ON p.contact_id = c.id
			 WHERE c.account_id = ? AND c.id = ?`,
		)
		.bind(accountId, contactId)
		.first<ContactRow>();
	if (!row) return null;

	const [tagMap, activities, stageHistory, eventLinks] = await Promise.all([
		loadTagsForContacts(db, accountId, [contactId]),
		db
			.prepare(
				`SELECT id, kind, body, author_account_id, occurred_at
				 FROM account_contact_activities
				 WHERE contact_id = ?
				 ORDER BY occurred_at DESC
				 LIMIT 50`,
			)
			.bind(contactId)
			.all<{
				id: string;
				kind: ContactActivity["kind"];
				body: string;
				author_account_id: string | null;
				occurred_at: number;
			}>(),
		db
			.prepare(
				`SELECT id, from_stage, to_stage, note, changed_by, changed_at
				 FROM account_contact_stage_history
				 WHERE contact_id = ?
				 ORDER BY changed_at DESC
				 LIMIT 50`,
			)
			.bind(contactId)
			.all<{
				id: string;
				from_stage: string | null;
				to_stage: string;
				note: string | null;
				changed_by: string | null;
				changed_at: number;
			}>(),
		listContactEventLinks(db, accountId, contactId, row.email),
	]);

	return {
		...mapContact(row, tagMap.get(contactId) ?? []),
		activities: activities.results.map(
			(entry): ContactActivity => ({
				id: entry.id,
				kind: entry.kind,
				body: entry.body,
				authorAccountId: entry.author_account_id,
				occurredAt: entry.occurred_at,
			}),
		),
		stageHistory: stageHistory.results.flatMap((entry): ContactStageHistoryEntry[] => {
			if (!isContactPipelineStage(entry.to_stage)) return [];
			return [
				{
					id: entry.id,
					fromStage: isContactPipelineStage(entry.from_stage) ? entry.from_stage : null,
					toStage: entry.to_stage,
					note: entry.note,
					changedBy: entry.changed_by,
					changedAt: entry.changed_at,
				},
			];
		}),
		eventLinks,
	};
}

async function listContactEventLinks(
	db: D1Database,
	accountId: string,
	contactId: string,
	email: string,
): Promise<ContactEventLink[]> {
	const links = await db
		.prepare(
			`SELECT esc.event_id, e.slug AS event_slug, e.name AS event_name, esc.person_id, esc.created_at AS linked_at
			 FROM event_speaker_contacts esc
			 JOIN events e ON e.id = esc.event_id
			 WHERE esc.contact_id = ?
			   AND (
			     EXISTS (
			       SELECT 1 FROM event_ownership o
			       WHERE o.event_id = e.id AND o.account_id = ?
			     )
			     OR EXISTS (
			       SELECT 1 FROM event_memberships m
			       WHERE m.event_id = e.id AND m.account_id = ?
			     )
			   )
			 ORDER BY esc.created_at DESC`,
		)
		.bind(contactId, accountId, accountId)
		.all<{
			event_id: string;
			event_slug: string;
			event_name: string;
			person_id: string;
			linked_at: number;
		}>();

	if (links.results.length) {
		return links.results.map((row) => ({
			eventId: row.event_id,
			eventSlug: row.event_slug,
			eventName: row.event_name,
			personId: row.person_id,
			linkedAt: row.linked_at,
		}));
	}

	// Fallback: same email on speaker profiles for events this account can manage.
	const byEmail = await db
		.prepare(
			`SELECT e.id AS event_id, e.slug AS event_slug, e.name AS event_name, p.id AS person_id,
				COALESCE(esp.created_at, sp.created_at, p.created_at) AS linked_at
			 FROM people p
			 JOIN events e
			 LEFT JOIN event_speaker_profiles esp ON esp.event_id = e.id AND esp.person_id = p.id
			 LEFT JOIN speaker_profiles sp ON sp.event_id = e.id AND sp.person_id = p.id
			 WHERE lower(p.email) = lower(?)
			   AND (esp.id IS NOT NULL OR sp.id IS NOT NULL)
			   AND (
			     EXISTS (
			       SELECT 1 FROM event_ownership o
			       WHERE o.event_id = e.id AND o.account_id = ?
			     )
			     OR EXISTS (
			       SELECT 1 FROM event_memberships m
			       WHERE m.event_id = e.id AND m.account_id = ?
			     )
			   )
			 ORDER BY linked_at DESC`,
		)
		.bind(email, accountId, accountId)
		.all<{
			event_id: string;
			event_slug: string;
			event_name: string;
			person_id: string;
			linked_at: number;
		}>();

	return byEmail.results.map((row) => ({
		eventId: row.event_id,
		eventSlug: row.event_slug,
		eventName: row.event_name,
		personId: row.person_id,
		linkedAt: row.linked_at,
	}));
}

export type UpsertContactInput = {
	email: string;
	name: string;
	title?: string | null;
	company?: string | null;
	bio?: string | null;
	notes?: string | null;
	customFields?: ContactCustomFields;
	tags?: readonly string[];
};

function validateContactInput(input: UpsertContactInput): ContactWriteResult<{
	email: string;
	name: string;
	title: string | null;
	company: string | null;
	bio: string | null;
	notes: string | null;
	customFields: ContactCustomFields;
}> {
	const email = normalizeEmail(input.email);
	const name = input.name.trim();
	if (!isPlausibleEmail(email)) {
		return { ok: false, error: "Enter a valid email address", status: 400 };
	}
	if (!name || name.length > MAX_NAME) {
		return { ok: false, error: "Name must be between 1 and 160 characters", status: 400 };
	}
	const title = input.title?.trim() || null;
	const company = input.company?.trim() || null;
	const bio = input.bio?.trim() || null;
	const notes = input.notes?.trim() || null;
	if (title && title.length > MAX_TITLE) return { ok: false, error: "Title is too long", status: 400 };
	if (company && company.length > MAX_COMPANY) return { ok: false, error: "Company is too long", status: 400 };
	if (bio && bio.length > MAX_BIO) return { ok: false, error: "Bio is too long", status: 400 };
	if (notes && notes.length > MAX_NOTES) return { ok: false, error: "Notes are too long", status: 400 };
	return {
		ok: true,
		value: {
			email,
			name,
			title,
			company,
			bio,
			notes,
			customFields: input.customFields ?? {},
		},
	};
}

async function replaceTags(
	db: D1Database,
	accountId: string,
	contactId: string,
	tags: readonly string[],
	now: number,
): Promise<void> {
	await db.prepare("DELETE FROM account_contact_tags WHERE contact_id = ? AND account_id = ?")
		.bind(contactId, accountId)
		.run();
	for (const tag of tags) {
		await db
			.prepare(
				`INSERT INTO account_contact_tags (account_id, contact_id, tag, created_at)
				 VALUES (?, ?, ?, ?)`,
			)
			.bind(accountId, contactId, tag, now)
			.run();
	}
}

export async function createAccountContact(
	db: D1Database,
	args: {
		accountId: string;
		input: UpsertContactInput;
		authorAccountId?: string | null;
		now?: number;
	},
): Promise<ContactWriteResult<AccountContact>> {
	const validated = validateContactInput(args.input);
	if (!validated.ok) return validated;
	const tagsResult =
		args.input.tags === undefined
			? ({ ok: true, value: [] as string[] } as const)
			: normalizeContactTags(args.input.tags);
	if (!tagsResult.ok) return tagsResult;

	const now = args.now ?? Date.now();
	const existing = await db
		.prepare(
			`SELECT id FROM account_contacts
			 WHERE account_id = ? AND email = ? COLLATE NOCASE`,
		)
		.bind(args.accountId, validated.value.email)
		.first<{ id: string }>();
	if (existing) {
		return { ok: false, error: "A contact with that email already exists", status: 409 };
	}

	const id = crypto.randomUUID();
	await db
		.prepare(
			`INSERT INTO account_contacts (
				id, account_id, email, name, title, company, bio, notes, custom_fields_json, created_at, updated_at
			) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		)
		.bind(
			id,
			args.accountId,
			validated.value.email,
			validated.value.name,
			validated.value.title,
			validated.value.company,
			validated.value.bio,
			validated.value.notes,
			JSON.stringify(validated.value.customFields),
			now,
			now,
		)
		.run();
	await replaceTags(db, args.accountId, id, tagsResult.value, now);
	await appendActivity(db, {
		contactId: id,
		kind: "system",
		body: "Contact created",
		authorAccountId: args.authorAccountId ?? args.accountId,
		occurredAt: now,
	});

	const detail = await getAccountContact(db, args.accountId, id);
	if (!detail) return { ok: false, error: "Contact create failed", status: 500 };
	return { ok: true, value: detail };
}

export async function updateAccountContact(
	db: D1Database,
	args: {
		accountId: string;
		contactId: string;
		input: Partial<UpsertContactInput> & { note?: string };
		authorAccountId?: string | null;
		now?: number;
	},
): Promise<ContactWriteResult<ContactDetail>> {
	const existing = await getAccountContact(db, args.accountId, args.contactId);
	if (!existing) return { ok: false, error: "Contact not found", status: 404 };

	const mergedInput: UpsertContactInput = {
		email: args.input.email ?? existing.email,
		name: args.input.name ?? existing.name,
		title: args.input.title !== undefined ? args.input.title : existing.title,
		company: args.input.company !== undefined ? args.input.company : existing.company,
		bio: args.input.bio !== undefined ? args.input.bio : existing.bio,
		notes: args.input.notes !== undefined ? args.input.notes : existing.notes,
		customFields:
			args.input.customFields !== undefined ? args.input.customFields : existing.customFields,
	};
	const validated = validateContactInput(mergedInput);
	if (!validated.ok) return validated;

	if (validated.value.email !== existing.email) {
		const clash = await db
			.prepare(
				`SELECT id FROM account_contacts
				 WHERE account_id = ? AND email = ? COLLATE NOCASE AND id != ?`,
			)
			.bind(args.accountId, validated.value.email, args.contactId)
			.first();
		if (clash) return { ok: false, error: "Another contact already uses that email", status: 409 };
	}

	const now = args.now ?? Date.now();
	await db
		.prepare(
			`UPDATE account_contacts
			 SET email = ?, name = ?, title = ?, company = ?, bio = ?, notes = ?,
			     custom_fields_json = ?, updated_at = ?
			 WHERE id = ? AND account_id = ?`,
		)
		.bind(
			validated.value.email,
			validated.value.name,
			validated.value.title,
			validated.value.company,
			validated.value.bio,
			validated.value.notes,
			JSON.stringify(validated.value.customFields),
			now,
			args.contactId,
			args.accountId,
		)
		.run();

	if (args.input.tags !== undefined) {
		const tagsResult = normalizeContactTags(args.input.tags);
		if (!tagsResult.ok) return tagsResult;
		await replaceTags(db, args.accountId, args.contactId, tagsResult.value, now);
	}

	const note = typeof args.input.note === "string" ? args.input.note.trim() : "";
	if (note) {
		if (note.length > MAX_ACTIVITY) {
			return { ok: false, error: "Note is too long", status: 400 };
		}
		await appendActivity(db, {
			contactId: args.contactId,
			kind: "note",
			body: note,
			authorAccountId: args.authorAccountId ?? args.accountId,
			occurredAt: now,
		});
	}

	const detail = await getAccountContact(db, args.accountId, args.contactId);
	if (!detail) return { ok: false, error: "Contact update failed", status: 500 };
	return { ok: true, value: detail };
}

export async function appendActivity(
	db: D1Database,
	args: {
		contactId: string;
		kind: ContactActivity["kind"];
		body: string;
		authorAccountId: string | null;
		occurredAt: number;
	},
): Promise<void> {
	await db
		.prepare(
			`INSERT INTO account_contact_activities (id, contact_id, kind, body, author_account_id, occurred_at)
			 VALUES (?, ?, ?, ?, ?, ?)`,
		)
		.bind(
			crypto.randomUUID(),
			args.contactId,
			args.kind,
			args.body.slice(0, MAX_ACTIVITY),
			args.authorAccountId,
			args.occurredAt,
		)
		.run();
}

export async function findDuplicateContactsByName(
	db: D1Database,
	accountId: string,
	name: string,
): Promise<AccountContact[]> {
	const trimmed = name.trim();
	if (!trimmed) return [];
	const rows = await db
		.prepare(
			`SELECT c.*, p.stage AS stage
			 FROM account_contacts c
			 LEFT JOIN account_contact_pipeline p ON p.contact_id = c.id
			 WHERE c.account_id = ? AND c.name = ? COLLATE NOCASE
			 ORDER BY c.created_at ASC`,
		)
		.bind(accountId, trimmed)
		.all<ContactRow>();
	const tags = await loadTagsForContacts(
		db,
		accountId,
		rows.results.map((row) => row.id),
	);
	return rows.results.map((row) => mapContact(row, tags.get(row.id) ?? []));
}

export async function getContactKpis(db: D1Database, accountId: string): Promise<ContactKpis> {
	const [total, pipeline, confirmed, companies] = await Promise.all([
		db
			.prepare("SELECT COUNT(*) AS count FROM account_contacts WHERE account_id = ?")
			.bind(accountId)
			.first<{ count: number }>(),
		db
			.prepare(
				`SELECT COUNT(*) AS count
				 FROM account_contact_pipeline p
				 JOIN account_contacts c ON c.id = p.contact_id
				 WHERE c.account_id = ?`,
			)
			.bind(accountId)
			.first<{ count: number }>(),
		db
			.prepare(
				`SELECT COUNT(*) AS count
				 FROM account_contact_pipeline p
				 JOIN account_contacts c ON c.id = p.contact_id
				 WHERE c.account_id = ? AND p.stage = 'confirmed'`,
			)
			.bind(accountId)
			.first<{ count: number }>(),
		db
			.prepare(
				`SELECT company, COUNT(*) AS count
				 FROM account_contacts
				 WHERE account_id = ? AND company IS NOT NULL AND TRIM(company) != ''
				 GROUP BY company COLLATE NOCASE
				 ORDER BY count DESC, company COLLATE NOCASE
				 LIMIT 5`,
			)
			.bind(accountId)
			.all<{ company: string; count: number }>(),
	]);

	return {
		totalContacts: total?.count ?? 0,
		inPipeline: pipeline?.count ?? 0,
		confirmed: confirmed?.count ?? 0,
		topCompanies: companies.results.map((row) => ({
			company: row.company,
			count: row.count,
		})),
	};
}

export async function listFilterOptions(
	db: D1Database,
	accountId: string,
): Promise<{ companies: string[]; titles: string[]; tags: string[] }> {
	const [companies, titles, tags] = await Promise.all([
		db
			.prepare(
				`SELECT DISTINCT company AS value FROM account_contacts
				 WHERE account_id = ? AND company IS NOT NULL AND TRIM(company) != ''
				 ORDER BY company COLLATE NOCASE`,
			)
			.bind(accountId)
			.all<{ value: string }>(),
		db
			.prepare(
				`SELECT DISTINCT title AS value FROM account_contacts
				 WHERE account_id = ? AND title IS NOT NULL AND TRIM(title) != ''
				 ORDER BY title COLLATE NOCASE`,
			)
			.bind(accountId)
			.all<{ value: string }>(),
		db
			.prepare(
				`SELECT DISTINCT tag AS value FROM account_contact_tags
				 WHERE account_id = ?
				 ORDER BY tag COLLATE NOCASE`,
			)
			.bind(accountId)
			.all<{ value: string }>(),
	]);
	return {
		companies: companies.results.map((row) => row.value),
		titles: titles.results.map((row) => row.value),
		tags: tags.results.map((row) => row.value),
	};
}
