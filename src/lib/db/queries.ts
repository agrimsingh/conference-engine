import type {
	AccountRow,
	AgendaTrackRow,
	AgendaSlotRow,
	AgendaSlotWithSubmissionRow,
	AssetRow,
	CfpFormRow,
	EvaluationPlanRow,
	EvaluationCriterionRow,
	EvaluationScoreRow,
	EventMembershipRow,
	EventRoomRow,
	EventRow,
	FormFieldRow,
	OutboundMessageRow,
	PersonRow,
	ReviewAssignmentRow,
	ReviewerRow,
	SpeakerProfileRow,
	SpeakerTaskRow,
	SubmissionLabelRow,
	SubmissionRow,
	SubmissionSpeakerRow,
	TaskTemplateRow,
} from "./types";

export async function getEventBySlug(
	db: D1Database,
	slug: string,
): Promise<EventRow | null> {
	return db.prepare("SELECT * FROM events WHERE slug = ?").bind(slug).first<EventRow>();
}

export async function getEventById(
	db: D1Database,
	eventId: string,
): Promise<EventRow | null> {
	return db.prepare("SELECT * FROM events WHERE id = ?").bind(eventId).first<EventRow>();
}

/** Event labels for an already-authorized collection. One query avoids portal N+1s. */
export async function listEventsByIds(
	db: D1Database,
	eventIds: string[],
): Promise<EventRow[]> {
	const ids = [...new Set(eventIds)];
	if (ids.length === 0) return [];
	const placeholders = ids.map(() => "?").join(", ");
	const result = await db
		.prepare(`SELECT * FROM events WHERE id IN (${placeholders}) ORDER BY name ASC`)
		.bind(...ids)
		.all<EventRow>();
	return result.results;
}

/** Person labels for an already-authorized collection. */
export async function listPeopleByIds(
	db: D1Database,
	personIds: string[],
): Promise<PersonRow[]> {
	const ids = [...new Set(personIds)];
	if (ids.length === 0) return [];
	const placeholders = ids.map(() => "?").join(", ");
	const result = await db
		.prepare(`SELECT * FROM people WHERE id IN (${placeholders})`)
		.bind(...ids)
		.all<PersonRow>();
	return result.results;
}

export async function listAllEvents(db: D1Database): Promise<EventRow[]> {
	const result = await db
		.prepare(`SELECT * FROM events ORDER BY name ASC`)
		.all<EventRow>();
	return result.results;
}

export async function getAccountById(
	db: D1Database,
	accountId: string,
): Promise<AccountRow | null> {
	return db
		.prepare("SELECT * FROM accounts WHERE id = ?")
		.bind(accountId)
		.first<AccountRow>();
}

export async function upsertAccountByEmail(
	db: D1Database,
	args: { email: string; name?: string; id?: string },
): Promise<AccountRow> {
	const email = args.email.trim().toLowerCase();
	const name = args.name?.trim() ?? "";
	const now = Date.now();
	const id = args.id ?? crypto.randomUUID();
	const account = await db
		.prepare(
			`INSERT INTO accounts (id, email, name, created_at, updated_at)
		 VALUES (?, ?, ?, ?, ?)
		 ON CONFLICT(email) DO UPDATE SET
			name = CASE
				WHEN trim(COALESCE(accounts.name, '')) = '' AND trim(excluded.name) <> ''
				THEN excluded.name
				ELSE accounts.name
			END,
			updated_at = CASE
				WHEN trim(COALESCE(accounts.name, '')) = '' AND trim(excluded.name) <> ''
				THEN excluded.updated_at
				ELSE accounts.updated_at
			END
		 RETURNING *`,
		)
		.bind(id, email, name, now, now)
		.first<AccountRow>();
	if (!account) throw new Error("Failed to create account");
	return account;
}

export async function getEventMembership(
	db: D1Database,
	eventId: string,
	accountId: string,
): Promise<EventMembershipRow | null> {
	return db
		.prepare(
			`SELECT m.id, m.event_id, m.account_id,
        CASE WHEN o.account_id = m.account_id THEN 'owner' ELSE 'admin' END AS role,
        m.created_at
       FROM event_memberships m
       LEFT JOIN event_ownership o ON o.event_id = m.event_id
       WHERE m.event_id = ? AND m.account_id = ?`,
		)
		.bind(eventId, accountId)
		.first<EventMembershipRow>();
}

export type EventMemberListRow = EventMembershipRow & {
	email: string;
	name: string;
};

export async function listEventMembers(
	db: D1Database,
	eventId: string,
): Promise<EventMemberListRow[]> {
	const result = await db
		.prepare(
			`SELECT m.id, m.event_id, m.account_id,
        CASE WHEN o.account_id = m.account_id THEN 'owner' ELSE 'admin' END AS role,
        m.created_at, a.email AS email, a.name AS name
       FROM event_memberships m
       INNER JOIN accounts a ON a.id = m.account_id
		 LEFT JOIN event_ownership o ON o.event_id = m.event_id
       WHERE m.event_id = ?
       ORDER BY
		 CASE WHEN o.account_id = m.account_id THEN 0 ELSE 1 END,
         a.email ASC`,
		)
		.bind(eventId)
		.all<EventMemberListRow>();
	return result.results;
}

export async function addEventMembership(
	db: D1Database,
	args: {
		eventId: string;
		accountId: string;
		role: "owner" | "admin";
	},
): Promise<EventMembershipRow> {
	const existing = await getEventMembership(db, args.eventId, args.accountId);
	if (existing) {
		if (args.role === "owner" && existing.role !== "owner") {
			return transferEventOwnership(db, {
				eventId: args.eventId,
				toAccountId: args.accountId,
			});
		}
		return existing;
	}

	const id = crypto.randomUUID();
	const now = Date.now();
	await db
		.prepare(
			`INSERT INTO event_memberships (id, event_id, account_id, role, created_at)
       VALUES (?, ?, ?, 'admin', ?)`,
		)
		.bind(id, args.eventId, args.accountId, now)
		.run();

	return {
		id,
		event_id: args.eventId,
		account_id: args.accountId,
		role: "admin",
		created_at: now,
	};
}

export async function removeEventMembership(
	db: D1Database,
	args: { eventId: string; accountId: string },
): Promise<boolean> {
	const membership = await getEventMembership(db, args.eventId, args.accountId);
	if (!membership) return false;
	const ownership = await db
		.prepare("SELECT account_id FROM event_ownership WHERE event_id = ?")
		.bind(args.eventId)
		.first<{ account_id: string }>();
	if (ownership?.account_id === args.accountId) {
		throw new Error("Cannot remove the event owner");
	}
	const result = await db
		.prepare(
			`DELETE FROM event_memberships
       WHERE event_id = ? AND account_id = ?
         AND NOT EXISTS (
           SELECT 1 FROM event_ownership o
           WHERE o.event_id = event_memberships.event_id
             AND o.account_id = event_memberships.account_id
         )`,
		)
		.bind(args.eventId, args.accountId)
		.run();
	return (result.meta.changes ?? 0) > 0;
}

export async function setEventMembershipRole(
	db: D1Database,
	args: {
		eventId: string;
		accountId: string;
		role: "owner" | "admin";
	},
): Promise<EventMembershipRow | null> {
	const membership = await getEventMembership(db, args.eventId, args.accountId);
	if (!membership) return null;
	if (args.role === "owner") {
		return transferEventOwnership(db, {
			eventId: args.eventId,
			toAccountId: args.accountId,
		});
	}
	assertMembershipRoleChange(membership.role, args.role);
	return { ...membership, role: "admin" };
}

export function assertMembershipRoleChange(
	currentRole: EventMembershipRow["role"],
	nextRole: EventMembershipRow["role"],
): void {
	if (currentRole === "owner" && nextRole === "admin") {
		throw new Error("Transfer ownership before demoting the event owner");
	}
}

/**
 * Promote `toAccountId` to owner and demote every current owner to admin.
 * Target must already be a member.
 */
export async function transferEventOwnership(
	db: D1Database,
	args: { eventId: string; toAccountId: string },
): Promise<EventMembershipRow> {
	const target = await getEventMembership(db, args.eventId, args.toAccountId);
	if (!target) {
		throw new Error("Target is not a member of this event");
	}
	if (target.role === "owner") {
		return target;
	}

	const now = Date.now();
	const result = await db
		.prepare(
			`UPDATE event_ownership
       SET account_id = ?, updated_at = ?
       WHERE event_id = ?`,
		)
		.bind(args.toAccountId, now, args.eventId)
		.run();
	if ((result.meta.changes ?? 0) === 0) {
		throw new Error("Event has no canonical owner");
	}
	return { ...target, role: "owner" };
}

export async function countEventMemberships(
	db: D1Database,
	eventId: string,
): Promise<number> {
	const row = await db
		.prepare(
			`SELECT COUNT(*) AS count FROM event_memberships WHERE event_id = ?`,
		)
		.bind(eventId)
		.first<{ count: number }>();
	return row?.count ?? 0;
}

/** Events with zero memberships — claimable by the first logged-in organizer. */
export async function listOrphanEvents(db: D1Database): Promise<EventRow[]> {
	const result = await db
		.prepare(
			`SELECT e.*
       FROM events e
       WHERE e.ownership_claimable = 1
         AND NOT EXISTS (SELECT 1 FROM event_ownership o WHERE o.event_id = e.id)
       ORDER BY e.name ASC`,
		)
		.all<EventRow>();
	return result.results;
}

/**
 * First claimer wins: insert owner membership only when the event has none.
 * Returns the membership row, or null if already claimed (or insert raced away).
 */
export async function claimOrphanEventOwnership(
	db: D1Database,
	args: { eventId: string; accountId: string },
): Promise<EventMembershipRow | null> {
	const existing = await getEventMembership(db, args.eventId, args.accountId);
	if (existing) return existing;

	const id = crypto.randomUUID();
	const now = Date.now();
	const results = await db.batch([
		db
			.prepare(
				`INSERT OR IGNORE INTO event_memberships (id, event_id, account_id, role, created_at)
         SELECT ?, ?, ?, 'admin', ?
         WHERE EXISTS (
           SELECT 1 FROM events
           WHERE id = ? AND ownership_claimable = 1
         ) AND NOT EXISTS (
           SELECT 1 FROM event_ownership WHERE event_id = ?
         )`,
			)
			.bind(id, args.eventId, args.accountId, now, args.eventId, args.eventId),
		db
			.prepare(
				`INSERT INTO event_ownership (event_id, account_id, created_at, updated_at)
         SELECT ?, ?, ?, ?
         WHERE EXISTS (
           SELECT 1 FROM event_memberships
           WHERE event_id = ? AND account_id = ?
         ) AND EXISTS (
           SELECT 1 FROM events WHERE id = ? AND ownership_claimable = 1
         ) AND NOT EXISTS (
           SELECT 1 FROM event_ownership WHERE event_id = ?
         )`,
			)
			.bind(args.eventId, args.accountId, now, now, args.eventId, args.accountId, args.eventId, args.eventId),
		db
			.prepare("UPDATE events SET ownership_claimable = 0, updated_at = ? WHERE id = ? AND ownership_claimable = 1")
			.bind(now, args.eventId),
	]);

	if ((results[1]?.meta.changes ?? 0) === 0) {
		return getEventMembership(db, args.eventId, args.accountId);
	}

	return {
		id,
		event_id: args.eventId,
		account_id: args.accountId,
		role: "owner",
		created_at: now,
	};
}

export async function listEventsForAccount(
	db: D1Database,
	accountId: string,
): Promise<EventRow[]> {
	const result = await db
		.prepare(
			`SELECT e.*
       FROM events e
       INNER JOIN event_memberships m ON m.event_id = e.id
       WHERE m.account_id = ?
       ORDER BY e.name ASC`,
		)
		.bind(accountId)
		.all<EventRow>();
	return result.results;
}

export async function getOpenForm(
	db: D1Database,
	eventId: string,
	formSlug: string,
): Promise<CfpFormRow | null> {
	const now = Date.now();
	return db
		.prepare(
			`SELECT * FROM cfp_forms
			 WHERE event_id = ? AND slug = ? AND status = 'open' AND kind = 'public'
				 AND (opens_at IS NULL OR opens_at <= ?)
				 AND (closes_at IS NULL OR closes_at > ?)`,
		)
		.bind(eventId, formSlug, now, now)
		.first<CfpFormRow>();
}

/** Public CFP surfaces never disclose internal system forms. */
export async function getPublicFormBySlug(
	db: D1Database,
	eventId: string,
	formSlug: string,
): Promise<CfpFormRow | null> {
	return db
		.prepare(`SELECT * FROM cfp_forms WHERE event_id = ? AND slug = ? AND kind = 'public'`)
		.bind(eventId, formSlug)
		.first<CfpFormRow>();
}

export async function getFormBySlug(
	db: D1Database,
	eventId: string,
	formSlug: string,
): Promise<CfpFormRow | null> {
	return db
		.prepare(`SELECT * FROM cfp_forms WHERE event_id = ? AND slug = ?`)
		.bind(eventId, formSlug)
		.first<CfpFormRow>();
}

export async function listFormFields(
	db: D1Database,
	formId: string,
): Promise<FormFieldRow[]> {
	const result = await db
		.prepare(
			`SELECT * FROM form_fields
       WHERE form_id = ? AND soft_deleted = 0
       ORDER BY position ASC`,
		)
		.bind(formId)
		.all<FormFieldRow>();
	return result.results;
}

export async function listSubmissionsForEvent(
	db: D1Database,
	eventId: string,
): Promise<SubmissionRow[]> {
	const result = await db
		.prepare(
			`SELECT * FROM submissions
       WHERE event_id = ?
       ORDER BY created_at DESC`,
		)
		.bind(eventId)
		.all<SubmissionRow>();
	return result.results;
}

export type AdminSubmissionPageFilters = {
	category: string;
	label: string;
	status: string;
	query: string;
	sort: "newest" | "title" | "status";
	page: number;
	pageSize: number;
};

export type SubmissionFacetCounts = {
	total: number;
	byCategory: Array<{ value: string | null; count: number }>;
	byStatus: Array<{ value: string; count: number }>;
	byLabel: Array<{ value: string; count: number }>;
};

function adminSubmissionWhere(eventId: string, filters: AdminSubmissionPageFilters): { sql: string; binds: unknown[] } {
	const clauses = ["s.event_id = ?"];
	const binds: unknown[] = [eventId];
	if (filters.category !== "all") {
		if (filters.category === "Uncategorized") clauses.push("s.category IS NULL");
		else { clauses.push("s.category = ?"); binds.push(filters.category); }
	}
	if (filters.label !== "all") {
		clauses.push("EXISTS (SELECT 1 FROM submission_labels sl WHERE sl.submission_id = s.id AND sl.label = ? COLLATE NOCASE)");
		binds.push(filters.label);
	}
	if (filters.status !== "all") { clauses.push("s.status = ?"); binds.push(filters.status); }
	if (filters.query) {
		const like = `%${filters.query.toLowerCase()}%`;
		clauses.push(`(
      lower(COALESCE(s.submitter_name, '')) LIKE ? OR
      lower(COALESCE(s.submitter_email, '')) LIKE ? OR
      lower(s.answers_json) LIKE ? OR
      lower(COALESCE(s.category, '')) LIKE ? OR
      EXISTS (SELECT 1 FROM submission_speakers ss WHERE ss.submission_id = s.id
        AND (lower(COALESCE(ss.name, '')) LIKE ? OR lower(COALESCE(ss.email, '')) LIKE ?))
    )`);
		binds.push(like, like, like, like, like, like);
	}
	return { sql: clauses.join(" AND "), binds };
}

/**
 * The organizer list must page in D1; the only unbounded reads around it are
 * compact facet aggregates used to render filter chips.
 */
export async function listAdminSubmissionsPage(
	db: D1Database,
	eventId: string,
	filters: AdminSubmissionPageFilters,
): Promise<{ rows: SubmissionRow[]; total: number }> {
	const { sql, binds } = adminSubmissionWhere(eventId, filters);
	const orderBy = filters.sort === "title"
		? "json_extract(s.answers_json, '$.title') COLLATE NOCASE ASC, s.created_at DESC"
		: filters.sort === "status"
			? "s.status ASC, s.created_at DESC"
			: "s.created_at DESC";
	const offset = (Math.max(1, filters.page) - 1) * filters.pageSize;
	const [rows, count] = await Promise.all([
		db.prepare(`SELECT s.* FROM submissions s WHERE ${sql} ORDER BY ${orderBy} LIMIT ? OFFSET ?`).bind(...binds, filters.pageSize, offset).all<SubmissionRow>(),
		db.prepare(`SELECT COUNT(*) AS count FROM submissions s WHERE ${sql}`).bind(...binds).first<{ count: number }>(),
	]);
	return { rows: rows.results, total: count?.count ?? 0 };
}

export async function getSubmissionFacetCounts(db: D1Database, eventId: string): Promise<SubmissionFacetCounts> {
	const [total, categories, statuses, labels] = await Promise.all([
		db.prepare("SELECT COUNT(*) AS count FROM submissions WHERE event_id = ?").bind(eventId).first<{ count: number }>(),
		db.prepare("SELECT category AS value, COUNT(*) AS count FROM submissions WHERE event_id = ? GROUP BY category").bind(eventId).all<{ value: string | null; count: number }>(),
		db.prepare("SELECT status AS value, COUNT(*) AS count FROM submissions WHERE event_id = ? GROUP BY status").bind(eventId).all<{ value: string; count: number }>(),
		db.prepare(`SELECT sl.label AS value, COUNT(*) AS count FROM submission_labels sl JOIN submissions s ON s.id = sl.submission_id WHERE s.event_id = ? GROUP BY sl.label ORDER BY sl.label COLLATE NOCASE ASC`).bind(eventId).all<{ value: string; count: number }>(),
	]);
	return { total: total?.count ?? 0, byCategory: categories.results, byStatus: statuses.results, byLabel: labels.results };
}

export async function getSubmissionById(
	db: D1Database,
	submissionId: string,
): Promise<SubmissionRow | null> {
	return db
		.prepare("SELECT * FROM submissions WHERE id = ?")
		.bind(submissionId)
		.first<SubmissionRow>();
}

export async function listSpeakersForSubmission(
	db: D1Database,
	submissionId: string,
): Promise<SubmissionSpeakerRow[]> {
	const result = await db
		.prepare(
			`SELECT * FROM submission_speakers
       WHERE submission_id = ?
       ORDER BY position ASC`,
		)
		.bind(submissionId)
		.all<SubmissionSpeakerRow>();
	return result.results;
}

const SPEAKERS_IN_CHUNK = 100;

export async function listSpeakersForSubmissions(
	db: D1Database,
	submissionIds: string[],
): Promise<Map<string, SubmissionSpeakerRow[]>> {
	const bySubmission = new Map<string, SubmissionSpeakerRow[]>();
	if (submissionIds.length === 0) return bySubmission;

	const uniqueIds = [...new Set(submissionIds)];
	for (let i = 0; i < uniqueIds.length; i += SPEAKERS_IN_CHUNK) {
		const chunk = uniqueIds.slice(i, i + SPEAKERS_IN_CHUNK);
		const placeholders = chunk.map(() => "?").join(", ");
		const result = await db
			.prepare(
				`SELECT * FROM submission_speakers
         WHERE submission_id IN (${placeholders})
         ORDER BY submission_id ASC, position ASC`,
			)
			.bind(...chunk)
			.all<SubmissionSpeakerRow>();
		for (const row of result.results) {
			const list = bySubmission.get(row.submission_id) ?? [];
			list.push(row);
			bySubmission.set(row.submission_id, list);
		}
	}
	return bySubmission;
}

export async function getSubmissionSpeakerById(
	db: D1Database,
	speakerId: string,
): Promise<SubmissionSpeakerRow | null> {
	return db
		.prepare("SELECT * FROM submission_speakers WHERE id = ?")
		.bind(speakerId)
		.first<SubmissionSpeakerRow>();
}

export async function getSpeakerByConfirmTokenHash(
	db: D1Database,
	tokenHash: string,
): Promise<SubmissionSpeakerRow | null> {
	return db
		.prepare("SELECT * FROM submission_speakers WHERE confirm_token_hash = ?")
		.bind(tokenHash)
		.first<SubmissionSpeakerRow>();
}

export type PendingCoSpeakerJoinRow = SubmissionSpeakerRow & {
	submission_status: string;
	answers_json: string;
};

/**
 * Pending co-speakers on live submissions (not rejected/withdrawn) — the
 * pipeline never stalls silently, so these count as outstanding work.
 */
export async function listPendingCoSpeakersForEvent(
	db: D1Database,
	eventId: string,
): Promise<PendingCoSpeakerJoinRow[]> {
	const result = await db
		.prepare(
			`SELECT ss.*, s.status AS submission_status, s.answers_json AS answers_json
       FROM submission_speakers ss
       JOIN submissions s ON s.id = ss.submission_id
       WHERE s.event_id = ?
         AND ss.status = 'pending'
         AND s.status NOT IN ('rejected', 'withdrawn')
       ORDER BY s.created_at DESC, ss.position ASC`,
		)
		.bind(eventId)
		.all<PendingCoSpeakerJoinRow>();
	return result.results;
}

export async function listLabelsForEvent(
	db: D1Database,
	eventId: string,
): Promise<SubmissionLabelRow[]> {
	const result = await db
		.prepare(
			`SELECT sl.* FROM submission_labels sl
       JOIN submissions s ON s.id = sl.submission_id
       WHERE s.event_id = ?
       ORDER BY sl.label ASC`,
		)
		.bind(eventId)
		.all<SubmissionLabelRow>();
	return result.results;
}

export async function listLabelsForSubmissions(db: D1Database, submissionIds: string[]): Promise<Map<string, string[]>> {
	const labels = new Map<string, string[]>();
	const ids = [...new Set(submissionIds)];
	if (!ids.length) return labels;
	const placeholders = ids.map(() => "?").join(", ");
	const result = await db.prepare(`SELECT submission_id, label FROM submission_labels WHERE submission_id IN (${placeholders}) ORDER BY label COLLATE NOCASE ASC`).bind(...ids).all<Pick<SubmissionLabelRow, "submission_id" | "label">>();
	for (const row of result.results) labels.set(row.submission_id, [...(labels.get(row.submission_id) ?? []), row.label]);
	return labels;
}

export async function hasSuccessfulOutboundDelivery(db: D1Database, args: { submissionId: string; toEmail: string; templateKey: string }): Promise<boolean> {
	const found = await db.prepare(`SELECT id FROM outbound_messages WHERE submission_id = ? AND lower(to_email) = lower(?) AND template_key = ? AND status = 'sent' LIMIT 1`).bind(args.submissionId, args.toEmail, args.templateKey).first<{ id: string }>();
	return Boolean(found);
}

export async function addSubmissionLabel(
	db: D1Database,
	submissionId: string,
	label: string,
): Promise<void> {
	await db
		.prepare(
			`INSERT OR IGNORE INTO submission_labels (id, submission_id, label, created_at)
       VALUES (?, ?, ?, ?)`,
		)
		.bind(crypto.randomUUID(), submissionId, label, Date.now())
		.run();
}

export async function removeSubmissionLabel(
	db: D1Database,
	submissionId: string,
	label: string,
): Promise<void> {
	await db
		.prepare(
			`DELETE FROM submission_labels
       WHERE submission_id = ? AND label = ? COLLATE NOCASE`,
		)
		.bind(submissionId, label)
		.run();
}

export async function getPersonByEmail(
	db: D1Database,
	email: string,
): Promise<PersonRow | null> {
	return db
		.prepare("SELECT * FROM people WHERE email = ?")
		.bind(email.trim().toLowerCase())
		.first<PersonRow>();
}

export async function getPersonById(
	db: D1Database,
	personId: string,
): Promise<PersonRow | null> {
	return db.prepare("SELECT * FROM people WHERE id = ?").bind(personId).first<PersonRow>();
}

export async function listTasksForPerson(
	db: D1Database,
	personId: string,
): Promise<SpeakerTaskRow[]> {
	const result = await db
		.prepare(
			`SELECT * FROM speaker_tasks
       WHERE person_id = ?
       ORDER BY created_at ASC`,
		)
		.bind(personId)
		.all<SpeakerTaskRow>();
	return result.results;
}

export async function listTasksForEvent(
	db: D1Database,
	eventId: string,
): Promise<SpeakerTaskRow[]> {
	const result = await db
		.prepare(
			`SELECT * FROM speaker_tasks
       WHERE event_id = ?
       ORDER BY created_at DESC`,
		)
		.bind(eventId)
		.all<SpeakerTaskRow>();
	return result.results;
}

export async function listTasksForSubmissions(db: D1Database, submissionIds: string[]): Promise<SpeakerTaskRow[]> {
	const ids = [...new Set(submissionIds)];
	if (!ids.length) return [];
	const placeholders = ids.map(() => "?").join(", ");
	const result = await db.prepare(`SELECT * FROM speaker_tasks WHERE submission_id IN (${placeholders}) ORDER BY created_at DESC`).bind(...ids).all<SpeakerTaskRow>();
	return result.results;
}

export async function listTasksForSubmission(
	db: D1Database,
	submissionId: string,
): Promise<SpeakerTaskRow[]> {
	const result = await db
		.prepare(
			`SELECT * FROM speaker_tasks
       WHERE submission_id = ?
       ORDER BY created_at ASC`,
		)
		.bind(submissionId)
		.all<SpeakerTaskRow>();
	return result.results;
}

export async function getSpeakerTaskById(
	db: D1Database,
	taskId: string,
): Promise<SpeakerTaskRow | null> {
	return db
		.prepare("SELECT * FROM speaker_tasks WHERE id = ?")
		.bind(taskId)
		.first<SpeakerTaskRow>();
}

export async function listTaskTemplatesForEvent(
	db: D1Database,
	eventId: string,
): Promise<TaskTemplateRow[]> {
	const result = await db
		.prepare(
			`SELECT * FROM task_templates
       WHERE event_id = ? AND soft_deleted = 0
       ORDER BY position ASC`,
		)
		.bind(eventId)
		.all<TaskTemplateRow>();
	return result.results;
}

export async function listAgendaTracks(
	db: D1Database,
	eventId: string,
	options?: { includeRetired?: boolean },
): Promise<AgendaTrackRow[]> {
	const includeRetired = options?.includeRetired === true;
	const result = await db
		.prepare(
			`SELECT * FROM agenda_tracks
       WHERE event_id = ?${includeRetired ? "" : " AND soft_deleted = 0"}
       ORDER BY position ASC, name ASC`,
		)
		.bind(eventId)
		.all<AgendaTrackRow>();
	return result.results;
}

export async function listEvaluationCriteriaForPlan(
	db: D1Database,
	planId: string,
): Promise<EvaluationCriterionRow[]> {
	const result = await db
		.prepare(
			`SELECT * FROM evaluation_criteria
       WHERE plan_id = ? AND soft_deleted = 0
       ORDER BY position ASC, label ASC`,
		)
		.bind(planId)
		.all<EvaluationCriterionRow>();
	return result.results;
}

export async function getSpeakerProfile(
	db: D1Database,
	eventId: string,
	personId: string,
): Promise<SpeakerProfileRow | null> {
	return db
		.prepare(
			`SELECT * FROM speaker_profiles
       WHERE event_id = ? AND person_id = ?`,
		)
		.bind(eventId, personId)
		.first<SpeakerProfileRow>();
}

export async function getAssetById(
	db: D1Database,
	assetId: string,
): Promise<AssetRow | null> {
	return db.prepare("SELECT * FROM assets WHERE id = ?").bind(assetId).first<AssetRow>();
}

export async function listAcceptedSubmissionsForPerson(
	db: D1Database,
	personId: string,
): Promise<SubmissionRow[]> {
	const result = await db
		.prepare(
			`SELECT s.*
       FROM submissions s
       INNER JOIN submission_speakers ss ON ss.submission_id = s.id
       WHERE ss.person_id = ? AND s.status = 'accepted'
       ORDER BY s.updated_at DESC`,
		)
		.bind(personId)
		.all<SubmissionRow>();
	return result.results;
}

/** Any submitter- or speaker-owned proposal may use the portal; task access is
 * still enforced by the acceptance-gated task rows themselves. */
export async function listSubmissionsForPerson(
	db: D1Database,
	personId: string,
): Promise<SubmissionRow[]> {
	const result = await db
		.prepare(
			`SELECT DISTINCT s.*
       FROM submissions s
       LEFT JOIN submission_speakers ss ON ss.submission_id = s.id
       WHERE s.submitter_person_id = ? OR ss.person_id = ?
       ORDER BY s.updated_at DESC`,
		)
		.bind(personId, personId)
		.all<SubmissionRow>();
	return result.results;
}

export async function getActiveEvaluationPlan(
	db: D1Database,
	eventId: string,
): Promise<EvaluationPlanRow | null> {
	return db
		.prepare(
			`SELECT * FROM evaluation_plans
       WHERE event_id = ? AND status = 'active'
       ORDER BY updated_at DESC
       LIMIT 1`,
		)
		.bind(eventId)
		.first<EvaluationPlanRow>();
}

export async function getEvaluationPlanByToken(
	db: D1Database,
	token: string,
): Promise<EvaluationPlanRow | null> {
	return db
		.prepare("SELECT * FROM evaluation_plans WHERE reviewer_token = ?")
		.bind(token)
		.first<EvaluationPlanRow>();
}

export async function getReviewerByToken(
	db: D1Database,
	token: string,
): Promise<ReviewerRow | null> {
	return db
		.prepare("SELECT * FROM reviewers WHERE token = ?")
		.bind(token)
		.first<ReviewerRow>();
}

export async function listReviewersForPlan(
	db: D1Database,
	planId: string,
): Promise<ReviewerRow[]> {
	const result = await db
		.prepare(
			`SELECT * FROM reviewers
       WHERE plan_id = ?
       ORDER BY created_at ASC, name ASC`,
		)
		.bind(planId)
		.all<ReviewerRow>();
	return result.results;
}

export async function listEvaluationScoresForPlan(
	db: D1Database,
	planId: string,
): Promise<EvaluationScoreRow[]> {
	const result = await db
		.prepare(
			`SELECT * FROM evaluation_scores
       WHERE plan_id = ?
       ORDER BY updated_at DESC`,
		)
		.bind(planId)
		.all<EvaluationScoreRow>();
	return result.results;
}

export async function listReviewableSubmissions(
	db: D1Database,
	eventId: string,
): Promise<SubmissionRow[]> {
	const result = await db
		.prepare(
			`SELECT * FROM submissions
       WHERE event_id = ?
         AND status IN ('submitted', 'under_review', 'accepted', 'rejected')
       ORDER BY created_at DESC`,
		)
		.bind(eventId)
		.all<SubmissionRow>();
	return result.results;
}

export async function getAgendaSlotBySubmission(
	db: D1Database,
	submissionId: string,
): Promise<AgendaSlotRow | null> {
	return db
		.prepare("SELECT * FROM agenda_slots WHERE submission_id = ?")
		.bind(submissionId)
		.first<AgendaSlotRow>();
}

export async function listAgendaSlotsForEvent(
	db: D1Database,
	eventId: string,
): Promise<AgendaSlotRow[]> {
	const result = await db
		.prepare(
			`SELECT * FROM agenda_slots
       WHERE event_id = ?
       ORDER BY starts_at ASC, room_name ASC`,
		)
		.bind(eventId)
		.all<AgendaSlotRow>();
	return result.results;
}

export async function listAgendaSlotsWithSubmissions(
	db: D1Database,
	eventId: string,
): Promise<AgendaSlotWithSubmissionRow[]> {
	const result = await db
		.prepare(
			`SELECT
         a.*,
         s.status AS submission_status,
         s.answers_json AS answers_json,
         s.category AS category,
         s.submitter_name AS submitter_name,
         s.submitter_email AS submitter_email,
         s.video_url AS video_url,
         s.google_doc_url AS google_doc_url,
         s.supporting_url AS supporting_url
       FROM agenda_slots a
       INNER JOIN submissions s ON s.id = a.submission_id
       WHERE a.event_id = ?
       ORDER BY a.starts_at ASC, a.room_name ASC`,
		)
		.bind(eventId)
		.all<AgendaSlotWithSubmissionRow>();
	return result.results;
}

export async function listEventRooms(
	db: D1Database,
	eventId: string,
): Promise<EventRoomRow[]> {
	const result = await db
		.prepare(
			`SELECT * FROM event_rooms
       WHERE event_id = ? AND soft_deleted = 0
       ORDER BY position ASC, name ASC`,
		)
		.bind(eventId)
		.all<EventRoomRow>();
	return result.results;
}

export async function listSchedulableSubmissions(
	db: D1Database,
	eventId: string,
): Promise<SubmissionRow[]> {
	const result = await db
		.prepare(
			`SELECT * FROM submissions
       WHERE event_id = ?
         AND status IN ('accepted', 'scheduled', 'published')
       ORDER BY updated_at DESC`,
		)
		.bind(eventId)
		.all<SubmissionRow>();
	return result.results;
}

export async function listOutboundForSubmission(
	db: D1Database,
	submissionId: string,
): Promise<OutboundMessageRow[]> {
	const result = await db
		.prepare(
			`SELECT * FROM outbound_messages
       WHERE submission_id = ?
       ORDER BY created_at DESC`,
		)
		.bind(submissionId)
		.all<OutboundMessageRow>();
	return result.results;
}

export async function listAssignmentsForReviewer(
	db: D1Database,
	planId: string,
	reviewerId: string,
): Promise<ReviewAssignmentRow[]> {
	const result = await db
		.prepare(
			`SELECT * FROM review_assignments
       WHERE plan_id = ? AND reviewer_id = ?
       ORDER BY created_at ASC`,
		)
		.bind(planId, reviewerId)
		.all<ReviewAssignmentRow>();
	return result.results;
}

export async function listAssignmentsForSubmission(
	db: D1Database,
	planId: string,
	submissionId: string,
): Promise<ReviewAssignmentRow[]> {
	const result = await db
		.prepare(
			`SELECT * FROM review_assignments
       WHERE plan_id = ? AND submission_id = ?
       ORDER BY created_at ASC`,
		)
		.bind(planId, submissionId)
		.all<ReviewAssignmentRow>();
	return result.results;
}

export async function listAssignmentsForPlan(
	db: D1Database,
	planId: string,
): Promise<ReviewAssignmentRow[]> {
	const result = await db
		.prepare(
			`SELECT * FROM review_assignments
       WHERE plan_id = ?
       ORDER BY created_at ASC`,
		)
		.bind(planId)
		.all<ReviewAssignmentRow>();
	return result.results;
}

export async function listAssignmentsForPlanSubmissions(db: D1Database, planId: string, submissionIds: string[]): Promise<ReviewAssignmentRow[]> {
	const ids = [...new Set(submissionIds)];
	if (!ids.length) return [];
	const placeholders = ids.map(() => "?").join(", ");
	const result = await db.prepare(`SELECT * FROM review_assignments WHERE plan_id = ? AND submission_id IN (${placeholders}) ORDER BY created_at ASC`).bind(planId, ...ids).all<ReviewAssignmentRow>();
	return result.results;
}

export async function clearAssignmentsForSubmission(
	db: D1Database,
	planId: string,
	submissionId: string,
): Promise<void> {
	await db
		.prepare(
			`DELETE FROM review_assignments
       WHERE plan_id = ? AND submission_id = ?`,
		)
		.bind(planId, submissionId)
		.run();
}

export async function insertReviewAssignment(
	db: D1Database,
	row: ReviewAssignmentRow,
): Promise<void> {
	await db
		.prepare(
			`INSERT INTO review_assignments
         (id, plan_id, reviewer_id, submission_id, created_at)
       VALUES (?, ?, ?, ?, ?)`,
		)
		.bind(row.id, row.plan_id, row.reviewer_id, row.submission_id, row.created_at)
		.run();
}
