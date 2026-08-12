import { getSubmissionById } from "@/lib/db/queries";

export function needsSlotAcknowledgement(args: {
	ackRequired: boolean;
	currentSequence: number;
	acknowledgedSequence: number | null;
}): boolean {
	if (!args.ackRequired) return false;
	return args.acknowledgedSequence === null || args.acknowledgedSequence < args.currentSequence;
}

export async function acknowledgeAgendaSlot(
	db: D1Database,
	args: { submissionId: string; personId: string; now?: number },
): Promise<{ ok: true; sequence: number } | { ok: false; error: string; status: number }> {
	const slot = await db
		.prepare(
			`SELECT slot.ack_required AS ack_required, COALESCE(l.sequence, 0) AS sequence
			 FROM agenda_slots slot
			 LEFT JOIN agenda_calendar_lifecycles l
			   ON l.event_id = slot.event_id AND l.submission_id = slot.submission_id
			 WHERE slot.submission_id = ?`,
		)
		.bind(args.submissionId)
		.first<{ ack_required: number; sequence: number }>();
	if (!slot) return { ok: false, error: "Session is not on the agenda", status: 404 };
	const now = args.now ?? Date.now();
	await db
		.prepare(
			`INSERT INTO agenda_slot_acks (submission_id, person_id, sequence, acknowledged_at)
			 VALUES (?, ?, ?, ?)
			 ON CONFLICT(submission_id, person_id) DO UPDATE SET
			   sequence = excluded.sequence,
			   acknowledged_at = excluded.acknowledged_at`,
		)
		.bind(args.submissionId, args.personId, slot.sequence, now)
		.run();
	return { ok: true, sequence: slot.sequence };
}

export async function speakerPersonIdsForActor(
	db: D1Database,
	args: { submissionId: string; actorPersonId: string },
): Promise<string[]> {
	const ids = new Set<string>();
	const submission = await getSubmissionById(db, args.submissionId);
	if (!submission) return [];
	if (submission.submitter_person_id === args.actorPersonId) {
		ids.add(args.actorPersonId);
	}
	const listed = await db
		.prepare(
			`SELECT person_id FROM submission_speakers
			 WHERE submission_id = ? AND person_id = ? AND status IN ('pending', 'confirmed')`,
		)
		.bind(args.submissionId, args.actorPersonId)
		.first<{ person_id: string }>();
	if (listed?.person_id) ids.add(listed.person_id);
	const managed = await db
		.prepare(
			`SELECT speaker_person_id FROM speaker_handoffs
			 WHERE submission_id = ? AND manager_person_id = ? AND status = 'accepted'`,
		)
		.bind(args.submissionId, args.actorPersonId)
		.all<{ speaker_person_id: string }>();
	for (const row of managed.results) ids.add(row.speaker_person_id);
	return [...ids];
}

export async function acknowledgeAgendaSlotForActor(
	db: D1Database,
	args: { submissionId: string; actorPersonId: string; now?: number },
): Promise<{ ok: true; sequence: number } | { ok: false; error: string; status: number }> {
	const people = await speakerPersonIdsForActor(db, {
		submissionId: args.submissionId,
		actorPersonId: args.actorPersonId,
	});
	if (people.length === 0) return { ok: false, error: "Forbidden", status: 403 };
	let sequence = 0;
	for (const personId of people) {
		const result = await acknowledgeAgendaSlot(db, {
			submissionId: args.submissionId,
			personId,
			now: args.now,
		});
		if (!result.ok) return result;
		sequence = result.sequence;
	}
	return { ok: true, sequence };
}

export async function slotAckStateForPerson(
	db: D1Database,
	args: { submissionId: string; personId: string },
): Promise<{ needsAck: boolean; sequence: number; startsAt: number | null; roomName: string | null }> {
	const row = await db
		.prepare(
			`SELECT slot.ack_required AS ack_required, slot.starts_at, slot.room_name,
			        COALESCE(l.sequence, 0) AS sequence, ack.sequence AS ack_sequence
			 FROM agenda_slots slot
			 LEFT JOIN agenda_calendar_lifecycles l
			   ON l.event_id = slot.event_id AND l.submission_id = slot.submission_id
			 LEFT JOIN agenda_slot_acks ack
			   ON ack.submission_id = slot.submission_id AND ack.person_id = ?
			 WHERE slot.submission_id = ?`,
		)
		.bind(args.personId, args.submissionId)
		.first<{
			ack_required: number;
			starts_at: number;
			room_name: string;
			sequence: number;
			ack_sequence: number | null;
		}>();
	if (!row) {
		return { needsAck: false, sequence: 0, startsAt: null, roomName: null };
	}
	return {
		needsAck: needsSlotAcknowledgement({
			ackRequired: row.ack_required === 1,
			currentSequence: row.sequence,
			acknowledgedSequence: row.ack_sequence,
		}),
		sequence: row.sequence,
		startsAt: row.starts_at,
		roomName: row.room_name,
	};
}

export async function slotAckStateForActor(
	db: D1Database,
	args: { submissionId: string; actorPersonId: string },
): Promise<{ needsAck: boolean; sequence: number; startsAt: number | null; roomName: string | null }> {
	const people = await speakerPersonIdsForActor(db, args);
	let latest = { needsAck: false, sequence: 0, startsAt: null as number | null, roomName: null as string | null };
	for (const personId of people) {
		const state = await slotAckStateForPerson(db, { submissionId: args.submissionId, personId });
		if (state.startsAt !== null) latest = { ...latest, sequence: state.sequence, startsAt: state.startsAt, roomName: state.roomName };
		if (state.needsAck) latest = { ...state, needsAck: true };
	}
	return latest;
}

export async function listPendingSlotAcksForEvent(
	db: D1Database,
	eventId: string,
): Promise<
	Array<{
		submission_id: string;
		answers_json: string;
		person_id: string;
		person_name: string | null;
		person_email: string;
		starts_at: number;
		room_name: string;
	}>
> {
	const speakers = await db
		.prepare(
			`SELECT s.id AS submission_id, s.answers_json, p.id AS person_id, p.name AS person_name,
			        p.email AS person_email, slot.starts_at, slot.room_name
			 FROM agenda_slots slot
			 JOIN submissions s ON s.id = slot.submission_id
			 JOIN agenda_calendar_lifecycles l
			   ON l.event_id = slot.event_id AND l.submission_id = s.id
			 JOIN submission_speakers ss
			   ON ss.submission_id = s.id AND ss.status = 'confirmed' AND ss.person_id IS NOT NULL
			 JOIN people p ON p.id = ss.person_id
			 LEFT JOIN agenda_slot_acks ack
			   ON ack.submission_id = s.id AND ack.person_id = p.id
			 WHERE slot.event_id = ? AND slot.ack_required = 1
			   AND (ack.sequence IS NULL OR ack.sequence < l.sequence)`,
		)
		.bind(eventId)
		.all<{
			submission_id: string;
			answers_json: string;
			person_id: string;
			person_name: string | null;
			person_email: string;
			starts_at: number;
			room_name: string;
		}>();
	const submitters = await db
		.prepare(
			`SELECT s.id AS submission_id, s.answers_json, p.id AS person_id, p.name AS person_name,
			        p.email AS person_email, slot.starts_at, slot.room_name
			 FROM agenda_slots slot
			 JOIN submissions s ON s.id = slot.submission_id
			 JOIN agenda_calendar_lifecycles l
			   ON l.event_id = slot.event_id AND l.submission_id = s.id
			 JOIN people p ON p.id = s.submitter_person_id
			 LEFT JOIN agenda_slot_acks ack
			   ON ack.submission_id = s.id AND ack.person_id = p.id
			 WHERE slot.event_id = ? AND slot.ack_required = 1
			   AND s.submitter_person_id IS NOT NULL
			   AND (ack.sequence IS NULL OR ack.sequence < l.sequence)`,
		)
		.bind(eventId)
		.all<{
			submission_id: string;
			answers_json: string;
			person_id: string;
			person_name: string | null;
			person_email: string;
			starts_at: number;
			room_name: string;
		}>();
	const seen = new Set<string>();
	const rows = [];
	for (const row of [...speakers.results, ...submitters.results]) {
		const key = `${row.submission_id}:${row.person_id}`;
		if (seen.has(key)) continue;
		seen.add(key);
		rows.push(row);
	}
	return rows.sort((left, right) => left.starts_at - right.starts_at);
}
