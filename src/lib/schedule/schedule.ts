import {
	getAgendaSlotBySubmission,
	getSubmissionById,
} from "@/lib/db/queries";
import type { AgendaSlotRow } from "@/lib/db/types";
import {
	IllegalSubmissionTransitionError,
	isSubmissionStatus,
	transitionSubmission,
	type SubmissionStatus,
} from "@/lib/domain";
import { stableAgendaUid } from "@/lib/email/ics";
import { notifyCalendarInvite } from "@/lib/email/notify";
import type { OutboundSendResult } from "@/lib/email/resend";
import { getCloudflareEnv } from "@/lib/db/cloudflare";

export type ScheduleResult =
	| {
			ok: true;
			slot: AgendaSlotRow;
			status: SubmissionStatus;
			email: OutboundSendResult | null;
			icsBytes: string;
	  }
	| { ok: false; error: string; status?: number };

export async function scheduleSubmission(
	db: D1Database,
	args: {
		submissionId: string;
		startsAtMs: number;
		endsAtMs: number;
		roomName: string;
	},
): Promise<ScheduleResult> {
	const roomName = args.roomName.trim();
	if (!roomName) {
		return { ok: false, error: "roomName required", status: 400 };
	}
	if (
		!Number.isFinite(args.startsAtMs) ||
		!Number.isFinite(args.endsAtMs) ||
		args.endsAtMs <= args.startsAtMs
	) {
		return {
			ok: false,
			error: "startsAt/endsAt must be valid ms with endsAt > startsAt",
			status: 400,
		};
	}

	const submission = await getSubmissionById(db, args.submissionId);
	if (!submission) {
		return { ok: false, error: "Submission not found", status: 404 };
	}
	if (!isSubmissionStatus(submission.status)) {
		return { ok: false, error: `Unknown status: ${submission.status}`, status: 500 };
	}

	const now = Date.now();
	let nextStatus: SubmissionStatus = submission.status;

	if (submission.status !== "scheduled") {
		try {
			nextStatus = transitionSubmission(submission.status, "scheduled");
		} catch (error) {
			if (error instanceof IllegalSubmissionTransitionError) {
				return { ok: false, error: error.message, status: 409 };
			}
			throw error;
		}
		await db
			.prepare(
				`UPDATE submissions SET status = ?, updated_at = ? WHERE id = ?`,
			)
			.bind(nextStatus, now, submission.id)
			.run();
	}

	const icsUid = stableAgendaUid(submission.event_id, submission.id);
	const existing = await getAgendaSlotBySubmission(db, submission.id);
	let slot: AgendaSlotRow;

	if (existing) {
		await db
			.prepare(
				`UPDATE agenda_slots
         SET room_name = ?, starts_at = ?, ends_at = ?, updated_at = ?
         WHERE id = ?`,
			)
			.bind(roomName, args.startsAtMs, args.endsAtMs, now, existing.id)
			.run();
		slot = {
			...existing,
			room_name: roomName,
			starts_at: args.startsAtMs,
			ends_at: args.endsAtMs,
			updated_at: now,
		};
	} else {
		const id = crypto.randomUUID();
		await db
			.prepare(
				`INSERT INTO agenda_slots (
          id, event_id, submission_id, room_name, starts_at, ends_at, ics_uid,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
			)
			.bind(
				id,
				submission.event_id,
				submission.id,
				roomName,
				args.startsAtMs,
				args.endsAtMs,
				icsUid,
				now,
				now,
			)
			.run();
		slot = {
			id,
			event_id: submission.event_id,
			submission_id: submission.id,
			room_name: roomName,
			starts_at: args.startsAtMs,
			ends_at: args.endsAtMs,
			ics_uid: icsUid,
			created_at: now,
			updated_at: now,
		};
	}

	const env = await getCloudflareEnv();
	const fromEmail = env.RESEND_FROM_EMAIL || "team@65labs.org";
	const { email, icsBytes } = await notifyCalendarInvite(db, {
		submissionId: submission.id,
		roomName,
		startsAtMs: args.startsAtMs,
		endsAtMs: args.endsAtMs,
		icsUid: slot.ics_uid,
		fromEmail,
	});

	return {
		ok: true,
		slot,
		status: nextStatus,
		email,
		icsBytes,
	};
}
