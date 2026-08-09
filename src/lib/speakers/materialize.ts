import type { PersonRow, SubmissionSpeakerRow, TaskTemplateRow } from "@/lib/db/types";

/**
 * Turning a confirmed submission speaker into a working speaker: person
 * record, event membership, profile, and onboarding tasks. Shared by
 * acceptance (all confirmed speakers) and late co-speaker confirmation.
 */

export type MaterializedSpeaker = {
	personId: string;
	spawnedTaskKeys: string[];
};

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
	},
	now: number,
): Promise<MaterializedSpeaker> {
	const templates = args.templates ?? await ensureTaskTemplates(db, args.eventId);
	const person = await ensurePersonForSpeaker(db, args.speaker, now);

	await db
		.prepare(
			`UPDATE submission_speakers
       SET person_id = ?
       WHERE id = ?`,
		)
		.bind(person.id, args.speaker.id)
		.run();

	await ensureEventMember(db, args.eventId, person.id, now);
	await ensureSpeakerProfile(db, args.eventId, person, args.speaker, now);

	const spawnedTaskKeys = await spawnSpeakerTasks(
		db,
		{
			eventId: args.eventId,
			submissionId: args.submissionId,
			personId: person.id,
		},
		templates,
		now,
	);

	return { personId: person.id, spawnedTaskKeys };
}

async function ensurePersonForSpeaker(
	db: D1Database,
	speaker: SubmissionSpeakerRow,
	now: number,
): Promise<PersonRow> {
	const email = speaker.email.trim().toLowerCase();
	const existing = await db
		.prepare("SELECT * FROM people WHERE email = ?")
		.bind(email)
		.first<PersonRow>();

	if (existing) {
		if (!existing.name && speaker.name.trim()) {
			await db
				.prepare("UPDATE people SET name = ? WHERE id = ?")
				.bind(speaker.name.trim(), existing.id)
				.run();
			return { ...existing, name: speaker.name.trim() };
		}
		return existing;
	}

	const id = crypto.randomUUID();
	await db
		.prepare(
			`INSERT INTO people (id, email, name, created_at)
       VALUES (?, ?, ?, ?)`,
		)
		.bind(id, email, speaker.name.trim() || null, now)
		.run();

	return {
		id,
		email,
		name: speaker.name.trim() || null,
		created_at: now,
	};
}

async function ensureEventMember(
	db: D1Database,
	eventId: string,
	personId: string,
	now: number,
): Promise<void> {
	await db
		.prepare(
			`INSERT OR IGNORE INTO event_members (
        id, event_id, person_id, role, created_at
      ) VALUES (?, ?, ?, 'speaker', ?)`,
		)
		.bind(crypto.randomUUID(), eventId, personId, now)
		.run();
}

async function ensureSpeakerProfile(
	db: D1Database,
	eventId: string,
	person: PersonRow,
	speaker: SubmissionSpeakerRow,
	now: number,
): Promise<void> {
	await db
		.prepare(
			`INSERT OR IGNORE INTO speaker_profiles (
        id, event_id, person_id, display_name, bio, headshot_asset_id, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, NULL, ?, ?)`,
		)
		.bind(
			crypto.randomUUID(),
			eventId,
			person.id,
			person.name ?? speaker.name,
			speaker.bio,
			now,
			now,
		)
		.run();
}

async function spawnSpeakerTasks(
	db: D1Database,
	args: { eventId: string; submissionId: string; personId: string },
	templates: TaskTemplateRow[],
	now: number,
): Promise<string[]> {
	const keys: string[] = [];
	const stmts = templates.map((template) => {
		keys.push(template.key);
		return db
			.prepare(
				`INSERT OR IGNORE INTO speaker_tasks (
          id, event_id, submission_id, person_id, template_key,
          template_label, template_task_kind, template_required,
          status, asset_id, text_value, completed_at, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', NULL, NULL, NULL, ?, ?)`,
			)
			.bind(
				crypto.randomUUID(),
				args.eventId,
				args.submissionId,
				args.personId,
				template.key,
				template.label,
				template.task_kind,
				template.required,
				now,
				now,
			);
	});

	if (stmts.length) {
		await db.batch(stmts);
	}

	return keys;
}
