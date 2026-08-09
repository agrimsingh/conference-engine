import {
	getEventById,
	getSubmissionById,
} from "@/lib/db/queries";
import type { MessageTemplateKey, RenderedMessage } from "@/lib/domain";
import { sendTemplatedEmail, type OutboundSendResult } from "./resend";
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
	},
): Promise<{ email: OutboundSendResult | null; icsBytes: string }> {
	const submission = await getSubmissionById(db, args.submissionId);
	if (!submission?.submitter_email) {
		return { email: null, icsBytes: "" };
	}

	const event = await getEventById(db, submission.event_id);
	if (!event) {
		return { email: null, icsBytes: "" };
	}

	const title = titleFromAnswersJson(submission.answers_json);
	const icsInput: IcsEventInput = {
		uid: args.icsUid,
		summary: `${title} — ${event.name}`,
		description: `Scheduled session for ${event.name}`,
		location: args.roomName,
		startsAtMs: args.startsAtMs,
		endsAtMs: args.endsAtMs,
		organizerEmail: args.fromEmail,
		attendeeEmail: submission.submitter_email,
		method: "REQUEST",
		sequence: args.sequence ?? 0,
	};
	const icsBytes = buildIcsInvite(icsInput);

	const email = await sendTemplatedEmail(db, {
		eventId: event.id,
		submissionId: submission.id,
		templateKey: "calendar_invite",
		toEmail: submission.submitter_email,
		context: {
			eventName: event.name,
			submitterName: submission.submitter_name ?? "there",
			title,
			roomName: args.roomName,
			startsAtIso: new Date(args.startsAtMs).toISOString(),
			endsAtIso: new Date(args.endsAtMs).toISOString(),
		},
		attachments: [
			{
				filename: "invite.ics",
				content: icsBytes,
				contentType: "text/calendar; method=REQUEST; charset=utf-8",
			},
		],
		force: true,
	});

	return { email, icsBytes };
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
	},
): Promise<{ email: OutboundSendResult | null; icsBytes: string }> {
	const submission = await getSubmissionById(db, args.submissionId);
	if (!submission?.submitter_email) return { email: null, icsBytes: "" };
	const event = await getEventById(db, submission.event_id);
	if (!event) return { email: null, icsBytes: "" };
	const title = titleFromAnswersJson(submission.answers_json);
	const icsBytes = buildIcsInvite({
		uid: args.icsUid,
		summary: `${title} — ${event.name}`,
		description: `Cancelled session for ${event.name}`,
		location: args.roomName,
		startsAtMs: args.startsAtMs,
		endsAtMs: args.endsAtMs,
		organizerEmail: args.fromEmail,
		attendeeEmail: submission.submitter_email,
		method: "CANCEL",
		sequence: args.sequence,
	});
	const email = await sendTemplatedEmail(db, {
		eventId: event.id,
		submissionId: submission.id,
		templateKey: "calendar_invite",
		toEmail: submission.submitter_email,
		context: { eventName: event.name, submitterName: submission.submitter_name ?? "there", title, roomName: args.roomName, startsAtIso: new Date(args.startsAtMs).toISOString(), endsAtIso: new Date(args.endsAtMs).toISOString() },
		override: { subject: `Cancelled: ${title} @ ${event.name}`, text: `Hi ${submission.submitter_name ?? "there"},\n\nThe scheduled session \"${title}\" at ${event.name} has been cancelled. A calendar cancellation is attached.\n\n— conference-engine` },
		attachments: [{ filename: "cancel.ics", content: icsBytes, contentType: "text/calendar; method=CANCEL; charset=utf-8" }],
		force: true,
	});
	return { email, icsBytes };
}
