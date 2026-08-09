import type { PersonRow, SubmissionSpeakerRow, TaskTemplateRow } from "@/lib/db/types";

/**
 * Turning a confirmed submission speaker into a working speaker: person
 * record, event membership, profile, and onboarding tasks. Shared by
 * acceptance (all confirmed speakers) and late co-speaker confirmation.
 */

export type MaterializedSpeaker = {
	personId: string;
	spawnedTaskKeys: string[];
	spawnedTaskIds: string[];
};

/** Mutable operation journal used by callers that need compensating cleanup
 * after a later write fails. It only contains rows this invocation inserted. */
export type MaterializedSpeakerResources = {
	personIds: string[];
	personNameRestores: Array<{ personId: string; originalName: string | null; writtenName: string }>;
	eventMembershipIds: string[];
	speakerProfileIds: string[];
	speakerTaskIds: string[];
};

/** A short-lived session claim supplied only by organizer session creation.
 * Other acceptance paths deliberately remain claim-free. */
export type MaterializationWriteFence = {
	submissionId: string;
	ownerToken: string;
	now: () => number;
	leaseMs: number;
	/** Test-only interleaving seam, called after renewal and before the fenced write. */
	beforePhaseWrite?: (phase: MaterializationWritePhase) => Promise<void>;
};

export type MaterializationWritePhase = "submission-speaker" | "person" | "person-name" | "speaker-link" | "member" | "profile" | "tasks" | "submitter-link";
export const MATERIALIZATION_WRITE_FENCE_PREDICATE = `EXISTS (
  SELECT 1 FROM session_materialization_claims
  WHERE submission_id = ? AND owner_token = ? AND lease_expires_at > ?
)`;

export class MaterializationClaimLostError extends Error {
	constructor() {
		super("Session materialization claim was lost; retry the import");
		this.name = "MaterializationClaimLostError";
	}
}

export class MissingTaskTemplatesError extends Error {
	readonly code = "MISSING_TASK_TEMPLATES";

	constructor(readonly eventId: string) {
		super(`Event ${eventId} has no active task templates`);
		this.name = "MissingTaskTemplatesError";
	}
}

export async function ensureTaskTemplates(
	db: D1Database,
	eventId: string,
): Promise<TaskTemplateRow[]> {
	const templates = await db
		.prepare(
			`SELECT * FROM task_templates
       WHERE event_id = ? AND soft_deleted = 0
       ORDER BY position ASC, key ASC`,
		)
		.bind(eventId)
		.all<TaskTemplateRow>();
	if (templates.results.length === 0) throw new MissingTaskTemplatesError(eventId);
	return templates.results;
}

export async function materializeAcceptedSpeaker(
	db: D1Database,
	args: {
		eventId: string;
		submissionId: string;
		speaker: SubmissionSpeakerRow;
		templates?: TaskTemplateRow[];
		createdResources?: MaterializedSpeakerResources;
		writeFence?: MaterializationWriteFence;
	},
	now: number,
): Promise<MaterializedSpeaker> {
	const templates = args.templates ?? await ensureTaskTemplates(db, args.eventId);
	const personResult = await ensurePersonForSpeaker(db, args.speaker, now, args.writeFence);
	const person = personResult.person;
	if (personResult.created) args.createdResources?.personIds.push(person.id);
	if (personResult.nameRestore) args.createdResources?.personNameRestores.push(personResult.nameRestore);

	const speakerLinkFence = await prepareMaterializationWriteFence(db, args.writeFence, "speaker-link");
	const speakerLink = await db
		.prepare(speakerLinkFence ?
			`UPDATE submission_speakers SET person_id = ?
       WHERE id = ? AND ${MATERIALIZATION_WRITE_FENCE_PREDICATE}` :
			`UPDATE submission_speakers
       SET person_id = ?
       WHERE id = ?`,
		)
		.bind(person.id, args.speaker.id, ...(speakerLinkFence ?? []))
		.run();
	if (speakerLinkFence && (speakerLink.meta.changes ?? 0) === 0) throw new MaterializationClaimLostError();

	const membershipId = await ensureEventMember(db, args.eventId, person.id, now, args.writeFence);
	if (membershipId) args.createdResources?.eventMembershipIds.push(membershipId);
	const profileId = await ensureSpeakerProfile(db, args.eventId, person, args.speaker, now, args.writeFence);
	if (profileId) args.createdResources?.speakerProfileIds.push(profileId);

	const spawnedTasks = await spawnSpeakerTasks(
		db,
		{
			eventId: args.eventId,
			submissionId: args.submissionId,
			personId: person.id,
		},
		templates,
		now,
		args.writeFence,
	);

	args.createdResources?.speakerTaskIds.push(...spawnedTasks.ids);
	return { personId: person.id, spawnedTaskKeys: spawnedTasks.keys, spawnedTaskIds: spawnedTasks.ids };
}

/** Renew immediately before each materialization phase. The conditional update
 * fences an owner that has been replaced after an expired lease. */
export async function renewMaterializationWriteFence(db: D1Database, fence: MaterializationWriteFence | undefined): Promise<void> {
	if (!fence) return;
	const now = fence.now();
	const renewed = await db.prepare(
		`UPDATE session_materialization_claims
     SET lease_expires_at = ?, updated_at = ?
     WHERE submission_id = ? AND owner_token = ? AND lease_expires_at > ?
     RETURNING owner_token`,
	).bind(now + fence.leaseMs, now, fence.submissionId, fence.ownerToken, now).first<{ owner_token: string }>();
	if (renewed?.owner_token !== fence.ownerToken) throw new MaterializationClaimLostError();
}

/** A write is allowed only when the just-renewed token is still current. The
 * returned bindings are embedded in that write's SQL, so a reclaim between
 * this check and the statement prevents the stale write. */
export async function prepareMaterializationWriteFence(db: D1Database, fence: MaterializationWriteFence | undefined, phase: MaterializationWritePhase): Promise<readonly [string, string, number] | null> {
	if (!fence) return null;
	await renewMaterializationWriteFence(db, fence);
	await fence.beforePhaseWrite?.(phase);
	return [fence.submissionId, fence.ownerToken, fence.now()];
}

async function ensurePersonForSpeaker(
	db: D1Database,
	speaker: SubmissionSpeakerRow,
	now: number,
	fence: MaterializationWriteFence | undefined,
): Promise<{ person: PersonRow; created: boolean; nameRestore?: { personId: string; originalName: string | null; writtenName: string } }> {
	const email = speaker.email.trim().toLowerCase();
	const existing = await db
		.prepare("SELECT * FROM people WHERE email = ?")
		.bind(email)
		.first<PersonRow>();

	if (existing) {
		if (!existing.name && speaker.name.trim()) {
			const nameFence = await prepareMaterializationWriteFence(db, fence, "person-name");
			const updated = await db
				.prepare(nameFence ? `UPDATE people SET name = ? WHERE id = ? AND name IS ? AND ${MATERIALIZATION_WRITE_FENCE_PREDICATE}` : "UPDATE people SET name = ? WHERE id = ?")
				.bind(speaker.name.trim(), existing.id, ...(nameFence ? [existing.name, ...nameFence] : []))
				.run();
			if (nameFence && (updated.meta.changes ?? 0) === 0) throw new MaterializationClaimLostError();
			return {
				person: { ...existing, name: speaker.name.trim() },
				created: false,
				nameRestore: { personId: existing.id, originalName: existing.name, writtenName: speaker.name.trim() },
			};
		}
		return { person: existing, created: false };
	}

	const id = crypto.randomUUID();
	const personFence = await prepareMaterializationWriteFence(db, fence, "person");
	const inserted = await db
		.prepare(personFence ?
			`INSERT INTO people (id, email, name, created_at)
       SELECT ?, ?, ?, ? WHERE ${MATERIALIZATION_WRITE_FENCE_PREDICATE}` :
			`INSERT INTO people (id, email, name, created_at)
       VALUES (?, ?, ?, ?)`,
		)
		.bind(id, email, speaker.name.trim() || null, now, ...(personFence ?? []))
		.run();
	if (personFence && (inserted.meta.changes ?? 0) === 0) throw new MaterializationClaimLostError();

	return { person: { id, email, name: speaker.name.trim() || null, created_at: now }, created: true };
}

async function ensureEventMember(
	db: D1Database,
	eventId: string,
	personId: string,
	now: number,
	fence: MaterializationWriteFence | undefined,
): Promise<string | null> {
	const id = crypto.randomUUID();
	const memberFence = await prepareMaterializationWriteFence(db, fence, "member");
	const result = await db
		.prepare(memberFence ?
			`INSERT OR IGNORE INTO event_members (id, event_id, person_id, role, created_at)
       SELECT ?, ?, ?, 'speaker', ? WHERE ${MATERIALIZATION_WRITE_FENCE_PREDICATE}` :
			`INSERT OR IGNORE INTO event_members (
        id, event_id, person_id, role, created_at
      ) VALUES (?, ?, ?, 'speaker', ?)`,
		)
		.bind(id, eventId, personId, now, ...(memberFence ?? []))
		.run();
	return (result.meta.changes ?? 0) > 0 ? id : null;
}

async function ensureSpeakerProfile(
	db: D1Database,
	eventId: string,
	person: PersonRow,
	speaker: SubmissionSpeakerRow,
	now: number,
	fence: MaterializationWriteFence | undefined,
): Promise<string | null> {
	const id = crypto.randomUUID();
	const profileFence = await prepareMaterializationWriteFence(db, fence, "profile");
	const result = await db
		.prepare(profileFence ?
			`INSERT OR IGNORE INTO speaker_profiles (
        id, event_id, person_id, display_name, bio, headshot_asset_id, created_at, updated_at
      ) SELECT ?, ?, ?, ?, ?, NULL, ?, ? WHERE ${MATERIALIZATION_WRITE_FENCE_PREDICATE}` :
			`INSERT OR IGNORE INTO speaker_profiles (
        id, event_id, person_id, display_name, bio, headshot_asset_id, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, NULL, ?, ?)`,
		)
		.bind(
			id,
			eventId,
			person.id,
			person.name ?? speaker.name,
			speaker.bio,
			now,
			now,
			...(profileFence ?? []),
		)
		.run();
	return (result.meta.changes ?? 0) > 0 ? id : null;
}

async function spawnSpeakerTasks(
	db: D1Database,
	args: { eventId: string; submissionId: string; personId: string },
	templates: TaskTemplateRow[],
	now: number,
	fence: MaterializationWriteFence | undefined,
): Promise<{ keys: string[]; ids: string[] }> {
	const taskFence = await prepareMaterializationWriteFence(db, fence, "tasks");
	const tasks = templates.map((template) => {
		const id = crypto.randomUUID();
		return {
			id,
			key: template.key,
			statement: db
			.prepare(taskFence ?
				`INSERT OR IGNORE INTO speaker_tasks (
          id, event_id, submission_id, person_id, template_key,
          template_label, template_task_kind, template_required,
          instructions, due_at,
          status, asset_id, text_value, completed_at, created_at, updated_at
        ) SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', NULL, NULL, NULL, ?, ?
          WHERE ${MATERIALIZATION_WRITE_FENCE_PREDICATE}` :
				`INSERT OR IGNORE INTO speaker_tasks (
          id, event_id, submission_id, person_id, template_key,
          template_label, template_task_kind, template_required,
          instructions, due_at,
          status, asset_id, text_value, completed_at, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', NULL, NULL, NULL, ?, ?)`,
			)
			.bind(
				id,
				args.eventId,
				args.submissionId,
				args.personId,
				template.key,
				template.label,
				template.task_kind,
				template.required,
				template.instructions ?? null,
				template.due_at ?? null,
				now,
				now,
				...(taskFence ?? []),
			),
		};
	});

	const results = tasks.length ? await db.batch(tasks.map((task) => task.statement)) : [];
	return {
		keys: tasks.map((task) => task.key),
		ids: tasks.flatMap((task, index) => (results[index]?.meta.changes ?? 0) > 0 ? [task.id] : []),
	};
}
