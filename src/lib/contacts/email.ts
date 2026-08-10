import { getEventById } from "@/lib/db/queries";
import { sendTemplatedEmail, type EmailDeliveryRuntime } from "@/lib/email/resend";
import { appendActivity, getAccountContact, type ContactWriteResult } from "./contacts";

export type BulkContactEmailResult = {
	sent: number;
	skipped: number;
	eventId: string;
};

/**
 * Bulk outreach for selected account contacts. Requires an event so delivery
 * rows land in the existing communications log (email_deliveries.event_id).
 */
export async function sendBulkContactEmail(
	db: D1Database,
	args: {
		accountId: string;
		contactIds: string[];
		eventId: string;
		subject: string;
		text: string;
		runtime: EmailDeliveryRuntime;
		authorAccountId?: string | null;
		now?: number;
	},
): Promise<ContactWriteResult<BulkContactEmailResult>> {
	if (!args.contactIds.length) {
		return { ok: false, error: "Select at least one contact", status: 400 };
	}
	if (args.contactIds.length > 100) {
		return { ok: false, error: "At most 100 recipients per send", status: 400 };
	}

	const subject = args.subject.trim();
	const text = args.text.trim();
	if (!subject || !text) {
		return { ok: false, error: "Subject and body are required", status: 400 };
	}
	if (subject.length > 500 || text.length > 20_000) {
		return { ok: false, error: "Subject or body is too long", status: 400 };
	}

	const event = await getEventById(db, args.eventId);
	if (!event) return { ok: false, error: "Event not found", status: 404 };

	const membership = await db
		.prepare("SELECT role FROM event_memberships WHERE event_id = ? AND account_id = ?")
		.bind(args.eventId, args.accountId)
		.first();
	const ownership = await db
		.prepare("SELECT account_id FROM event_ownership WHERE event_id = ?")
		.bind(args.eventId)
		.first<{ account_id: string }>();
	if (ownership?.account_id !== args.accountId && !membership) {
		return { ok: false, error: "You do not manage that event", status: 403 };
	}

	const now = args.now ?? Date.now();
	let sent = 0;
	let skipped = 0;

	for (const contactId of args.contactIds) {
		const contact = await getAccountContact(db, args.accountId, contactId);
		if (!contact) {
			skipped += 1;
			continue;
		}
		const firstName = contact.name.trim().split(/\s+/)[0] || "there";
		const personalizedSubject = subject
			.replaceAll("{{first_name}}", firstName)
			.replaceAll("{{name}}", contact.name)
			.replaceAll("{{company}}", contact.company ?? "");
		const personalizedText = text
			.replaceAll("{{first_name}}", firstName)
			.replaceAll("{{name}}", contact.name)
			.replaceAll("{{company}}", contact.company ?? "");

		const result = await sendTemplatedEmail(db, {
			eventId: args.eventId,
			submissionId: null,
			toEmail: contact.email,
			templateKey: "speaker_announcement",
			context: {
				eventName: event.name,
				submitterName: firstName,
				title: personalizedText,
				portalHint: "",
				portalUrl: "",
			},
			override: { subject: personalizedSubject, text: personalizedText },
			deliveryScope: `account-contacts:${subject}`,
			runtime: args.runtime,
		});

		if (!result.ok || result.status === "skipped") {
			skipped += 1;
			continue;
		}

		await appendActivity(db, {
			contactId: contact.id,
			kind: "email",
			body: `Sent: ${personalizedSubject}`,
			authorAccountId: args.authorAccountId ?? args.accountId,
			occurredAt: now,
		});
		sent += 1;
	}

	return { ok: true, value: { sent, skipped, eventId: args.eventId } };
}
