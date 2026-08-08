import {
	IllegalSubmissionTransitionError,
	isSubmissionStatus,
	speakerTaskTypesInOrder,
	transitionSubmission,
	type SubmissionStatus,
} from "@/lib/domain";
import {
	getSubmissionById,
	listSpeakersForSubmission,
} from "@/lib/db/queries";
import type { PersonRow, SubmissionSpeakerRow } from "@/lib/db/types";

export type AcceptResult =
	| {
			ok: true;
			submissionId: string;
			status: "accepted";
			spawnedTaskKeys: string[];
			speakerPersonIds: string[];
	  }
	| { ok: false; error: string; status?: number };

export async function acceptSubmission(
	db: D1Database,
	submissionId: string,
): Promise<AcceptResult> {
	const submission = await getSubmissionById(db, submissionId);
	if (!submission) {
		return { ok: false, error: "Submission not found", status: 404 };
	}

	if (!isSubmissionStatus(submission.status)) {
		return { ok: false, error: `Unknown status: ${submission.status}`, status: 500 };
	}

	const now = Date.now();
	let nextStatus: SubmissionStatus = submission.status;

	if (submission.status !== "accepted") {
		try {
			nextStatus = transitionSubmission(submission.status, "accepted");
		} catch (error) {
			if (error instanceof IllegalSubmissionTransitionError) {
				return {
					ok: false,
					error: error.message,
					status: 409,
				};
			}
			throw error;
		}

		await db
			.prepare(
				`UPDATE submissions
         SET status = ?, updated_at = ?
         WHERE id = ?`,
			)
			.bind(nextStatus, now, submissionId)
			.run();
	}

	const speakers = await listSpeakersForSubmission(db, submissionId);
	if (!speakers.length) {
		return { ok: false, error: "Submission has no speakers", status: 400 };
	}

	await ensureTaskTemplates(db, submission.event_id);

	const speakerPersonIds: string[] = [];
	const spawnedTaskKeys = new Set<string>();

	for (const speaker of speakers) {
		const person = await ensurePersonForSpeaker(db, speaker, now);
		speakerPersonIds.push(person.id);

		await db
			.prepare(
				`UPDATE submission_speakers
         SET person_id = ?
         WHERE id = ?`,
			)
			.bind(person.id, speaker.id)
			.run();

		await ensureEventMember(db, submission.event_id, person.id, now);
		await ensureSpeakerProfile(db, submission.event_id, person, speaker, now);

		const keys = await spawnSpeakerTasks(
			db,
			{
				eventId: submission.event_id,
				submissionId,
				personId: person.id,
			},
			now,
		);
		for (const key of keys) spawnedTaskKeys.add(key);
	}

	return {
		ok: true,
		submissionId,
		status: "accepted",
		spawnedTaskKeys: [...spawnedTaskKeys],
		speakerPersonIds,
	};
}

async function ensureTaskTemplates(
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
