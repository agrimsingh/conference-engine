import {
	getAgendaSlotBySubmission,
	listAgendaSlotsForEvent,
	listEventRooms,
	listSpeakersForSubmission,
	getSubmissionById,
} from "@/lib/db/queries";
import type { AgendaSlotRow } from "@/lib/db/types";
import {
	IllegalSubmissionTransitionError,
	detectConflicts,
	formatScheduleConflicts,
	isSubmissionStatus,
	normalizeSpeakerKey,
	transitionSubmission,
	type ScheduleInterval,
	type SubmissionStatus,
} from "@/lib/domain";
import { stableAgendaUid } from "@/lib/email/ics";
import { notifyCalendarInvite } from "@/lib/email/notify";
import type { OutboundSendResult } from "@/lib/email/resend";
import { getCloudflareEnv } from "@/lib/db/cloudflare";
import { broadcastEventInvalidate } from "@/lib/realtime/event-room";

export type ScheduleResult =
	| {
			ok: true;
			slot: AgendaSlotRow;
			status: SubmissionStatus;
			email: OutboundSendResult | null;
			icsBytes: string;
			broadcasted: boolean;
	  }
	| { ok: false; error: string; status?: number };

async function loadInterval(
	db: D1Database,
	slot: Pick<AgendaSlotRow, "submission_id" | "room_name" | "starts_at" | "ends_at">,
): Promise<ScheduleInterval> {
	const speakers = await listSpeakersForSubmission(db, slot.submission_id);
	// Pending co-speakers still count for double-booking; declined/removed don't.
	return {
		submissionId: slot.submission_id,
		roomName: slot.room_name,
		startsAtMs: slot.starts_at,
		endsAtMs: slot.ends_at,
		speakerKeys: speakers
			.filter(
				(speaker) =>
					speaker.status === "confirmed" || speaker.status === "pending",
			)
			.map((speaker) => normalizeSpeakerKey(speaker.email)),
	};
}

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

	const eventRooms = await listEventRooms(db, submission.event_id);
	if (eventRooms.length > 0) {
		const knownRooms = new Set(eventRooms.map((r) => r.name.trim()));
		if (!knownRooms.has(roomName)) {
			return {
				ok: false,
				error: `Unknown room "${roomName}". Use one of: ${[...knownRooms].join(", ")}`,
				status: 400,
			};
		}
	}

	const candidateSpeakers = await listSpeakersForSubmission(db, submission.id);
	const candidate: ScheduleInterval = {
		submissionId: submission.id,
		roomName,
		startsAtMs: args.startsAtMs,
		endsAtMs: args.endsAtMs,
		speakerKeys: candidateSpeakers.map((speaker) =>
			normalizeSpeakerKey(speaker.email),
		),
	};

	const existingSlots = await listAgendaSlotsForEvent(db, submission.event_id);
	const existingIntervals = await Promise.all(
		existingSlots.map((slot) => loadInterval(db, slot)),
	);
	const conflicts = detectConflicts(candidate, existingIntervals);
	if (conflicts.length > 0) {
		return {
			ok: false,
			error: formatScheduleConflicts(conflicts),
			status: 409,
		};
	}

	const now = Date.now();
	let nextStatus: SubmissionStatus = submission.status;

	if (submission.status !== "scheduled" && submission.status !== "published") {
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

	const broadcasted = await broadcastEventInvalidate(
		submission.event_id,
		"schedule.mutate",
	);

	return {
		ok: true,
		slot,
		status: nextStatus,
		email,
		icsBytes,
		broadcasted,
	};
}
