import { appendActivity, getAccountContact, listAccountContacts, type ContactWriteResult } from "./contacts";
import {
	isContactPipelineStage,
	PIPELINE_STAGE_LABELS,
	type AccountContact,
	type ContactPipelineStage,
} from "./types";

export type PipelineBoard = Record<ContactPipelineStage, AccountContact[]>;

export async function getPipelineBoard(
	db: D1Database,
	accountId: string,
): Promise<PipelineBoard> {
	const contacts = await listAccountContacts(db, accountId);
	const board: PipelineBoard = {
		research: [],
		outreach: [],
		negotiating: [],
		confirmed: [],
		declined: [],
	};
	for (const contact of contacts) {
		if (contact.stage) board[contact.stage].push(contact);
	}
	return board;
}

export async function enrollContactInPipeline(
	db: D1Database,
	args: {
		accountId: string;
		contactId: string;
		stage?: ContactPipelineStage;
		note?: string | null;
		authorAccountId?: string | null;
		now?: number;
	},
): Promise<ContactWriteResult<{ contactId: string; stage: ContactPipelineStage }>> {
	const contact = await getAccountContact(db, args.accountId, args.contactId);
	if (!contact) return { ok: false, error: "Contact not found", status: 404 };

	const stage = args.stage ?? "research";
	if (!isContactPipelineStage(stage)) {
		return { ok: false, error: "Invalid pipeline stage", status: 400 };
	}
	const now = args.now ?? Date.now();
	const fromStage = contact.stage;

	await db
		.prepare(
			`INSERT INTO account_contact_pipeline (contact_id, stage, updated_at)
			 VALUES (?, ?, ?)
			 ON CONFLICT(contact_id) DO UPDATE SET stage = excluded.stage, updated_at = excluded.updated_at`,
		)
		.bind(contact.id, stage, now)
		.run();

	if (fromStage !== stage) {
		await db
			.prepare(
				`INSERT INTO account_contact_stage_history (
					id, contact_id, from_stage, to_stage, note, changed_by, changed_at
				) VALUES (?, ?, ?, ?, ?, ?, ?)`,
			)
			.bind(
				crypto.randomUUID(),
				contact.id,
				fromStage,
				stage,
				args.note?.trim() || null,
				args.authorAccountId ?? args.accountId,
				now,
			)
			.run();

		await appendActivity(db, {
			contactId: contact.id,
			kind: "stage",
			body: fromStage
				? `Moved from ${PIPELINE_STAGE_LABELS[fromStage]} to ${PIPELINE_STAGE_LABELS[stage]}`
				: `Enrolled in pipeline at ${PIPELINE_STAGE_LABELS[stage]}`,
			authorAccountId: args.authorAccountId ?? args.accountId,
			occurredAt: now,
		});
	}

	const cardNote = args.note?.trim();
	if (cardNote) {
		await appendActivity(db, {
			contactId: contact.id,
			kind: "note",
			body: cardNote,
			authorAccountId: args.authorAccountId ?? args.accountId,
			occurredAt: now + 1,
		});
	}

	return { ok: true, value: { contactId: contact.id, stage } };
}

export async function moveContactPipelineStage(
	db: D1Database,
	args: {
		accountId: string;
		contactId: string;
		toStage: ContactPipelineStage;
		note?: string | null;
		authorAccountId?: string | null;
		now?: number;
	},
): Promise<ContactWriteResult<{ contactId: string; stage: ContactPipelineStage }>> {
	return enrollContactInPipeline(db, {
		accountId: args.accountId,
		contactId: args.contactId,
		stage: args.toStage,
		note: args.note,
		authorAccountId: args.authorAccountId,
		now: args.now,
	});
}
