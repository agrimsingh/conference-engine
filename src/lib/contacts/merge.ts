import { appendActivity, getAccountContact, type ContactWriteResult } from "./contacts";
import type { ContactDetail } from "./types";

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

	// Prefer non-empty primary fields; fill gaps from secondary.
	const title = primary.title || secondary.title;
	const company = primary.company || secondary.company;
	const bio = primary.bio || secondary.bio;
	const notes = [primary.notes, secondary.notes].filter(Boolean).join("\n\n") || null;
	const customFields = { ...secondary.customFields, ...primary.customFields };

	await db
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
		)
		.run();

	for (const tag of secondary.tags) {
		await db
			.prepare(
				`INSERT OR IGNORE INTO account_contact_tags (account_id, contact_id, tag, created_at)
				 VALUES (?, ?, ?, ?)`,
			)
			.bind(args.accountId, primary.id, tag, now)
			.run();
	}

	await db
		.prepare("UPDATE account_contact_activities SET contact_id = ? WHERE contact_id = ?")
		.bind(primary.id, secondary.id)
		.run();
	await db
		.prepare("UPDATE account_contact_stage_history SET contact_id = ? WHERE contact_id = ?")
		.bind(primary.id, secondary.id)
		.run();
	await db
		.prepare("UPDATE event_speaker_contacts SET contact_id = ? WHERE contact_id = ?")
		.bind(primary.id, secondary.id)
		.run();

	if (!primary.stage && secondary.stage) {
		await db
			.prepare(
				`INSERT INTO account_contact_pipeline (contact_id, stage, updated_at)
				 VALUES (?, ?, ?)
				 ON CONFLICT(contact_id) DO UPDATE SET stage = excluded.stage, updated_at = excluded.updated_at`,
			)
			.bind(primary.id, secondary.stage, now)
			.run();
	}

	await appendActivity(db, {
		contactId: primary.id,
		kind: "merge",
		body: `Merged duplicate ${secondary.name} <${secondary.email}> into this record`,
		authorAccountId: author,
		occurredAt: now,
	});

	await db.prepare("DELETE FROM account_contacts WHERE id = ? AND account_id = ?")
		.bind(secondary.id, args.accountId)
		.run();

	const detail = await getAccountContact(db, args.accountId, primary.id);
	if (!detail) return { ok: false, error: "Merge failed", status: 500 };
	return { ok: true, value: detail };
}
