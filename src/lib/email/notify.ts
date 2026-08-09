import {
	getEventById,
	getSubmissionById,
	listEventMembers,
	listSpeakersForSubmission,
} from "@/lib/db/queries";
import type { MessageTemplateKey, RenderedMessage } from "@/lib/domain";
import { sendTemplatedEmail, type EmailDeliveryRuntime, type OutboundSendResult } from "./resend";
import { buildIcsInvite, type IcsEventInput } from "./ics";

export type OrganizerSubmissionNotifyKind = "created" | "updated";

const ORGANIZER_SUBMISSION_TEMPLATE: Record<
	OrganizerSubmissionNotifyKind,
	Extract<MessageTemplateKey, "submission_received_organizer" | "submission_updated_organizer">
> = {
	created: "submission_received_organizer",
	updated: "submission_updated_organizer",
};

/** Defaults when columns are absent (pre-migration rows / incomplete fixtures). */
export function isOrganizerSubmissionNotifyEnabled(
	event: {
		notify_on_submission_create?: number | null;
		notify_on_submission_update?: number | null;
	},
	kind: OrganizerSubmissionNotifyKind,
): boolean {
	switch (kind) {
		case "created":
			return (event.notify_on_submission_create ?? 1) === 1;
		case "updated":
			return (event.notify_on_submission_update ?? 0) === 1;
		default: {
			const _exhaustive: never = kind;
			return _exhaustive;
		}
	}
}

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

/**
 * Fan-out to event owner + admin members. Create is one logical mail per
 * recipient; updates scope by submission.updated_at so retries converge and
 * draft autosaves never enter this path.
 */
export async function notifyOrganizersOfSubmission(
	db: D1Database,
	args: {
		submissionId: string;
		kind: OrganizerSubmissionNotifyKind;
		runtime?: EmailDeliveryRuntime;
	},
): Promise<OutboundSendResult[]> {
	const submission = await getSubmissionById(db, args.submissionId);
	if (!submission) return [];
	const event = await getEventById(db, submission.event_id);
	if (!event) return [];
	if (!isOrganizerSubmissionNotifyEnabled(event, args.kind)) return [];
	const members = await listEventMembers(db, event.id);
	const recipients = new Map<string, string>();
	for (const member of members) {
		const email = member.email.trim().toLowerCase();
		if (!email) continue;
		recipients.set(email, member.name.trim() || "there");
	}
	if (recipients.size === 0) return [];
	const templateKey = ORGANIZER_SUBMISSION_TEMPLATE[args.kind];
	const title = titleFromAnswersJson(submission.answers_json);
	const submitterLabel = [
		submission.submitter_name?.trim(),
		submission.submitter_email?.trim().toLowerCase(),
	]
		.filter(Boolean)
		.join(" · ");
	const deliveryScope =
		args.kind === "updated" ? `submission-updated:${submission.updated_at}` : undefined;
	return Promise.all(
		[...recipients.entries()].map(([toEmail, organizerName]) =>
			sendTemplatedEmail(db, {
				eventId: event.id,
				submissionId: submission.id,
				templateKey,
				toEmail,
				context: {
					eventName: event.name,
					submitterName: organizerName,
					title,
					portalHint: submitterLabel ? `Submitter: ${submitterLabel}.` : undefined,
				},
				deliveryScope,
				runtime: args.runtime,
			}),
		),
	);
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
