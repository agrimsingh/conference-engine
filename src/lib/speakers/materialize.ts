import { speakerTaskTypesInOrder } from "@/lib/domain";
import type { PersonRow, SubmissionSpeakerRow } from "@/lib/db/types";

/**
 * Turning a confirmed submission speaker into a working speaker: person
 * record, event membership, profile, and onboarding tasks. Shared by
 * acceptance (all confirmed speakers) and late co-speaker confirmation.
 */

export type MaterializedSpeaker = {
	personId: string;
	spawnedTaskKeys: string[];
};

export async function ensureTaskTemplates(
	db: D1Database,
	eventId: string,
): Promise<void> {
	const stmts = speakerTaskTypesInOrder().map((meta) =>
		db
			.prepare(
				`INSERT OR IGNORE INTO task_templates (
          id, event_id, key, label, task_kind, required, position
        ) VALUES (?, ?, ?, ?, ?, 1, ?)`,
			)
			.bind(
				`tmpl_${eventId}_${meta.key}`,
				eventId,
				meta.key,
				meta.label,
				meta.kind,
				meta.position,
			),
	);
	if (stmts.length) {
		await db.batch(stmts);
	}
}

export async function materializeAcceptedSpeaker(
	db: D1Database,
	args: {
		eventId: string;
		submissionId: string;
		speaker: SubmissionSpeakerRow;
	},
	now: number,
): Promise<MaterializedSpeaker> {
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
	now: number,
): Promise<string[]> {
	const keys: string[] = [];
	const stmts = speakerTaskTypesInOrder().map((meta) => {
		keys.push(meta.key);
		return db
			.prepare(
				`INSERT OR IGNORE INTO speaker_tasks (
          id, event_id, submission_id, person_id, template_key,
          status, asset_id, text_value, completed_at, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, 'pending', NULL, NULL, NULL, ?, ?)`,
			)
			.bind(
				crypto.randomUUID(),
				args.eventId,
				args.submissionId,
				args.personId,
				meta.key,
				now,
				now,
			);
	});

	if (stmts.length) {
		await db.batch(stmts);
	}

	return keys;
}
