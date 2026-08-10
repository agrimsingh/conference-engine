import { getAccountContact, type ContactWriteResult } from "./contacts";
import {
	CONTACT_PIPELINE_STAGES,
	type ContactDetail,
	type ContactPipelineStage,
} from "./types";

/** Later index in CONTACT_PIPELINE_STAGES wins when both contacts are enrolled. */
export function preferPipelineStage(
	primary: ContactPipelineStage | null,
	secondary: ContactPipelineStage | null,
): ContactPipelineStage | null {
	if (!primary) return secondary;
	if (!secondary) return primary;
	return CONTACT_PIPELINE_STAGES.indexOf(primary) >= CONTACT_PIPELINE_STAGES.indexOf(secondary)
		? primary
		: secondary;
}

/**
 * Merge secondary into primary (same account). Primary keeps its id/email.
 * Secondary tags/activities/pipeline history move over; secondary is deleted.
 */
export async function mergeAccountContacts(
	db: D1Database,
	args: {
		accountId: string;
		primaryContactId: string;
		secondaryContactId: string;
		authorAccountId?: string | null;
		now?: number;
	},
): Promise<ContactWriteResult<ContactDetail>> {
	if (args.primaryContactId === args.secondaryContactId) {
		return { ok: false, error: "Choose two different contacts to merge", status: 400 };
	}

	const [primary, secondary] = await Promise.all([
		getAccountContact(db, args.accountId, args.primaryContactId),
		getAccountContact(db, args.accountId, args.secondaryContactId),
	]);
	if (!primary || !secondary) {
		return { ok: false, error: "One or both contacts were not found", status: 404 };
	}

	const now = args.now ?? Date.now();
	const author = args.authorAccountId ?? args.accountId;

	const title = primary.title || secondary.title;
	const company = primary.company || secondary.company;
	const bio = primary.bio || secondary.bio;
	const notes = [primary.notes, secondary.notes].filter(Boolean).join("\n\n") || null;
	const customFields = { ...secondary.customFields, ...primary.customFields };
	const stage = preferPipelineStage(primary.stage, secondary.stage);

	const overlappingEvents = await db
		.prepare(
			`SELECT secondary.event_id AS event_id
			 FROM event_speaker_contacts secondary
			 INNER JOIN event_speaker_contacts primary_link
			   ON primary_link.event_id = secondary.event_id
			  AND primary_link.contact_id = ?
			 WHERE secondary.contact_id = ?`,
		)
		.bind(primary.id, secondary.id)
		.all<{ event_id: string }>();
	const overlapIds = overlappingEvents.results.map((row) => row.event_id);

	const statements: D1PreparedStatement[] = [
		db
			.prepare(
				`UPDATE account_contacts
				 SET title = ?, company = ?, bio = ?, notes = ?, custom_fields_json = ?, updated_at = ?
				 WHERE id = ? AND account_id = ?`,
			)
			.bind(
				title,
				company,
				bio,
				notes,
				JSON.stringify(customFields),
				now,
				primary.id,
				args.accountId,
			),
	];

	for (const tag of secondary.tags) {
		statements.push(
			db
				.prepare(
					`INSERT OR IGNORE INTO account_contact_tags (account_id, contact_id, tag, created_at)
					 VALUES (?, ?, ?, ?)`,
				)
				.bind(args.accountId, primary.id, tag, now),
		);
	}

	statements.push(
		db
			.prepare("UPDATE account_contact_activities SET contact_id = ? WHERE contact_id = ?")
			.bind(primary.id, secondary.id),
		db
			.prepare("UPDATE account_contact_stage_history SET contact_id = ? WHERE contact_id = ?")
			.bind(primary.id, secondary.id),
	);

	if (overlapIds.length) {
		const placeholders = overlapIds.map(() => "?").join(", ");
		statements.push(
			db
				.prepare(
					`DELETE FROM event_speaker_contacts
					 WHERE contact_id = ? AND event_id IN (${placeholders})`,
				)
				.bind(secondary.id, ...overlapIds),
		);
	}

	statements.push(
		db
			.prepare("UPDATE event_speaker_contacts SET contact_id = ? WHERE contact_id = ?")
			.bind(primary.id, secondary.id),
	);

	if (stage) {
		statements.push(
			db
				.prepare(
					`INSERT INTO account_contact_pipeline (contact_id, stage, updated_at)
					 VALUES (?, ?, ?)
					 ON CONFLICT(contact_id) DO UPDATE SET stage = excluded.stage, updated_at = excluded.updated_at`,
				)
				.bind(primary.id, stage, now),
		);
	}

	statements.push(
		db
			.prepare(
				`INSERT INTO account_contact_activities (id, contact_id, kind, body, author_account_id, occurred_at)
				 VALUES (?, ?, 'merge', ?, ?, ?)`,
			)
			.bind(
				crypto.randomUUID(),
				primary.id,
				`Merged duplicate ${secondary.name} <${secondary.email}> into this record`,
				author,
				now,
			),
		db
			.prepare("DELETE FROM account_contacts WHERE id = ? AND account_id = ?")
			.bind(secondary.id, args.accountId),
	);

	await db.batch(statements);

	const detail = await getAccountContact(db, args.accountId, primary.id);
	if (!detail) return { ok: false, error: "Merge failed", status: 500 };
	return { ok: true, value: detail };
}
