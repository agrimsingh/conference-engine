import { getEventById } from "@/lib/db/queries";
import { upsertEventSpeakerProfile } from "@/lib/speakers/roster";
import { appendActivity, getAccountContact, type ContactWriteResult } from "./contacts";

export type PushContactResult = {
	contactId: string;
	eventId: string;
	personId: string;
	speakerName: string;
};

export async function pushContactToEvent(
	db: D1Database,
	args: {
		accountId: string;
		contactId: string;
		eventId: string;
		authorAccountId?: string | null;
		now?: number;
	},
): Promise<ContactWriteResult<PushContactResult>> {
	const contact = await getAccountContact(db, args.accountId, args.contactId);
	if (!contact) return { ok: false, error: "Contact not found", status: 404 };

	const event = await getEventById(db, args.eventId);
	if (!event) return { ok: false, error: "Event not found", status: 404 };

	const ownership = await db
		.prepare("SELECT account_id FROM event_ownership WHERE event_id = ?")
		.bind(args.eventId)
		.first<{ account_id: string }>();
	const membership = await db
		.prepare("SELECT role FROM event_memberships WHERE event_id = ? AND account_id = ?")
		.bind(args.eventId, args.accountId)
		.first<{ role: string }>();
	if (ownership?.account_id !== args.accountId && !membership) {
		return { ok: false, error: "You do not manage that event", status: 403 };
	}

	const existingLink = await db
		.prepare(
			`SELECT person_id FROM event_speaker_contacts
			 WHERE event_id = ? AND contact_id = ?`,
		)
		.bind(args.eventId, contact.id)
		.first<{ person_id: string }>();
	if (existingLink) {
		return {
			ok: true,
			value: {
				contactId: contact.id,
				eventId: args.eventId,
				personId: existingLink.person_id,
				speakerName: contact.name,
			},
		};
	}

	const now = args.now ?? Date.now();
	const upserted = await upsertEventSpeakerProfile(db, {
		eventId: args.eventId,
		input: {
			email: contact.email,
			name: contact.name,
			jobTitle: contact.title,
			company: contact.company,
			bio: contact.bio,
			workflowStatus: "invited",
		},
		now,
	});
	if (!upserted.ok) {
		return { ok: false, error: upserted.error, status: upserted.status };
	}

	await db
		.prepare(
			`INSERT INTO event_speaker_contacts (event_id, person_id, contact_id, created_at)
			 VALUES (?, ?, ?, ?)
			 ON CONFLICT(event_id, person_id) DO UPDATE SET contact_id = excluded.contact_id`,
		)
		.bind(args.eventId, upserted.speaker.personId, contact.id, now)
		.run();

	await appendActivity(db, {
		contactId: contact.id,
		kind: "system",
		body: `Added to event roster: ${event.name}`,
		authorAccountId: args.authorAccountId ?? args.accountId,
		occurredAt: now,
	});

	return {
		ok: true,
		value: {
			contactId: contact.id,
			eventId: args.eventId,
			personId: upserted.speaker.personId,
			speakerName: upserted.speaker.name,
		},
	};
}
