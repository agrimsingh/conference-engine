import {
	getEventById,
	getSubmissionById,
	listSpeakersForSubmission,
} from "@/lib/db/queries";
import type { MessageTemplateKey, RenderedMessage } from "@/lib/domain";
import { sendTemplatedEmail, type EmailDeliveryRuntime, type OutboundSendResult } from "./resend";
import { buildIcsInvite, type IcsEventInput } from "./ics";

export function titleFromAnswersJson(answersJson: string): string {
	try {
		const parsed: unknown = JSON.parse(answersJson);
		if (
			typeof parsed === "object" &&
			parsed !== null &&
			"title" in parsed &&
			typeof (parsed as { title: unknown }).title === "string"
		) {
			return (parsed as { title: string }).title;
		}
	} catch {
		// ignore
	}
	return "(untitled)";
}

export async function notifySubmissionLifecycle(
	db: D1Database,
	args: {
		submissionId: string;
		templateKey: Extract<
			MessageTemplateKey,
			"submission_received" | "acceptance" | "rejection" | "waitlist"
		>;
		portalHint?: string;
		/** Organizer-edited subject/body for this send. */
		override?: RenderedMessage;
		force?: boolean;
	},
): Promise<OutboundSendResult | null> {
	const submission = await getSubmissionById(db, args.submissionId);
	if (!submission?.submitter_email) return null;

	const event = await getEventById(db, submission.event_id);
	if (!event) return null;

	return sendTemplatedEmail(db, {
		eventId: event.id,
		submissionId: submission.id,
		templateKey: args.templateKey,
		toEmail: submission.submitter_email,
		context: {
			eventName: event.name,
			submitterName: submission.submitter_name ?? "there",
			title: titleFromAnswersJson(submission.answers_json),
			portalHint: args.portalHint,
		},
		override: args.override,
		force: args.force,
	});
}

export async function notifyConfirmedSpeakerLifecycle(
	db: D1Database,
	args: {
		submissionId: string;
		templateKey: Extract<MessageTemplateKey, "acceptance">;
		portalHint?: string;
		override?: RenderedMessage;
		force?: boolean;
		runtime?: EmailDeliveryRuntime;
	},
): Promise<OutboundSendResult[]> {
	const submission = await getSubmissionById(db, args.submissionId);
	if (!submission) return [];
	const event = await getEventById(db, submission.event_id);
	if (!event) return [];
	const recipients = await confirmedRecipients(db, submission.id, submission.submitter_email, submission.submitter_name);
	return Promise.all(recipients.map((recipient) => sendTemplatedEmail(db, {
		eventId: event.id,
		submissionId: submission.id,
		templateKey: args.templateKey,
		toEmail: recipient.email,
		context: {
			eventName: event.name,
			submitterName: recipient.name || "there",
			title: titleFromAnswersJson(submission.answers_json),
			portalHint: args.portalHint,
		},
		override: personalizeOverride(args.override, submission.submitter_name, recipient.name),
		force: args.force,
		runtime: args.runtime,
	})));
}

export async function notifyCalendarInvite(
	db: D1Database,
	args: {
		submissionId: string;
		roomName: string;
		startsAtMs: number;
		endsAtMs: number;
		icsUid: string;
		sequence?: number;
		fromEmail: string;
		runtime?: EmailDeliveryRuntime;
	},
): Promise<{ email: OutboundSendResult | null; emails: OutboundSendResult[]; icsBytes: string }> {
	const submission = await getSubmissionById(db, args.submissionId);
	if (!submission?.submitter_email) {
		return { email: null, emails: [], icsBytes: "" };
	}

	const event = await getEventById(db, submission.event_id);
	if (!event) {
		return { email: null, emails: [], icsBytes: "" };
	}

	const title = titleFromAnswersJson(submission.answers_json);
	const baseIcsInput: Omit<IcsEventInput, "attendeeEmail"> = {
		uid: args.icsUid,
		summary: `${title} — ${event.name}`,
		description: `Scheduled session for ${event.name}`,
		location: args.roomName,
		startsAtMs: args.startsAtMs,
		endsAtMs: args.endsAtMs,
		organizerEmail: args.fromEmail,
		method: "REQUEST",
		sequence: args.sequence ?? 0,
	};
	const recipients = await confirmedRecipients(db, submission.id, submission.submitter_email, submission.submitter_name);
	const sends = await Promise.all(recipients.map(async (recipient) => {
		const icsBytes = buildIcsInvite({ ...baseIcsInput, attendeeEmail: recipient.email });
		const email = await sendTemplatedEmail(db, {
			eventId: event.id, submissionId: submission.id, templateKey: "calendar_invite", toEmail: recipient.email,
			context: { eventName: event.name, submitterName: recipient.name || "there", title, roomName: args.roomName, startsAtIso: new Date(args.startsAtMs).toISOString(), endsAtIso: new Date(args.endsAtMs).toISOString() },
			attachments: [{ filename: "invite.ics", content: icsBytes, contentType: "text/calendar; method=REQUEST; charset=utf-8" }],
			force: true, runtime: args.runtime,
		});
		return { email, icsBytes };
	}));
	return { email: sends[0]?.email ?? null, emails: sends.map((send) => send.email), icsBytes: sends[0]?.icsBytes ?? "" };
}

export async function notifyCalendarCancellation(
	db: D1Database,
	args: {
		submissionId: string;
		roomName: string;
		startsAtMs: number;
		endsAtMs: number;
		icsUid: string;
		sequence: number;
		fromEmail: string;
		runtime?: EmailDeliveryRuntime;
	},
	): Promise<{ email: OutboundSendResult | null; emails: OutboundSendResult[]; icsBytes: string }> {
	const submission = await getSubmissionById(db, args.submissionId);
	if (!submission?.submitter_email) return { email: null, emails: [], icsBytes: "" };
	const event = await getEventById(db, submission.event_id);
	if (!event) return { email: null, emails: [], icsBytes: "" };
	const title = titleFromAnswersJson(submission.answers_json);
	const baseIcsInput: Omit<IcsEventInput, "attendeeEmail"> = {
		uid: args.icsUid,
		summary: `${title} — ${event.name}`,
		description: `Cancelled session for ${event.name}`,
		location: args.roomName,
		startsAtMs: args.startsAtMs,
		endsAtMs: args.endsAtMs,
		organizerEmail: args.fromEmail,
		method: "CANCEL",
		sequence: args.sequence,
	};
	const recipients = await confirmedRecipients(db, submission.id, submission.submitter_email, submission.submitter_name);
	const sends = await Promise.all(recipients.map(async (recipient) => {
		const icsBytes = buildIcsInvite({ ...baseIcsInput, attendeeEmail: recipient.email });
		const email = await sendTemplatedEmail(db, {
			eventId: event.id, submissionId: submission.id, templateKey: "calendar_invite", toEmail: recipient.email,
			context: { eventName: event.name, submitterName: recipient.name || "there", title, roomName: args.roomName, startsAtIso: new Date(args.startsAtMs).toISOString(), endsAtIso: new Date(args.endsAtMs).toISOString() },
			override: { subject: `Cancelled: ${title} @ ${event.name}`, text: `Hi ${recipient.name || "there"},\n\nThe scheduled session \"${title}\" at ${event.name} has been cancelled. A calendar cancellation is attached.\n\n— conference-engine` },
			attachments: [{ filename: "cancel.ics", content: icsBytes, contentType: "text/calendar; method=CANCEL; charset=utf-8" }],
			force: true, runtime: args.runtime,
		});
		return { email, icsBytes };
	}));
	return { email: sends[0]?.email ?? null, emails: sends.map((send) => send.email), icsBytes: sends[0]?.icsBytes ?? "" };
}

async function confirmedRecipients(db: D1Database, submissionId: string, fallbackEmail: string | null, fallbackName: string | null) {
	const speakers = await listSpeakersForSubmission(db, submissionId);
	const confirmed = speakers.filter((speaker) => speaker.status === "confirmed" && speaker.email.trim());
	const source = confirmed.length ? confirmed.map(({ email, name }) => ({ email, name })) : fallbackEmail ? [{ email: fallbackEmail, name: fallbackName ?? "" }] : [];
	const unique = new Map<string, { email: string; name: string }>();
	for (const recipient of source) unique.set(recipient.email.trim().toLowerCase(), { email: recipient.email.trim().toLowerCase(), name: recipient.name.trim() });
	return [...unique.values()];
}

function personalizeOverride(override: RenderedMessage | undefined, originalName: string | null, recipientName: string): RenderedMessage | undefined {
	if (!override || !originalName?.trim() || !recipientName.trim() || originalName.trim() === recipientName.trim()) return override;
	return {
		subject: override.subject.split(originalName.trim()).join(recipientName.trim()),
		text: override.text.split(originalName.trim()).join(recipientName.trim()),
	};
}
