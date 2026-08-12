import {
	groupOutstandingTasks,
	titleFromAnswers,
	type OutstandingTaskRow,
	type OutstandingTasksSnapshot,
	type PendingCoSpeakerItem,
} from "@/lib/domain";
import {
	getPersonById,
	getSubmissionById,
	listPendingCoSpeakersForEvent,
	listTasksForEvent,
} from "@/lib/db/queries";
import type { EventRow } from "@/lib/db/types";
import { listPendingSlotAcksForEvent } from "@/lib/schedule/slot-ack";

function parseAnswers(raw: string): Record<string, unknown> {
	try {
		const parsed: unknown = JSON.parse(raw);
		if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
			return parsed as Record<string, unknown>;
		}
	} catch {
		// ignore
	}
	return {};
}

export async function loadOutstandingTasksSnapshot(
	db: D1Database,
	event: EventRow,
): Promise<OutstandingTasksSnapshot> {
	const tasks = await listTasksForEvent(db, event.id);
	const pending = tasks.filter((task) => task.status === "pending" && task.template_required !== 0);

	const personCache = new Map<
		string,
		{ email: string; name: string | null }
	>();
	const submissionTitleCache = new Map<string, string>();

	const rows: OutstandingTaskRow[] = [];
	for (const task of pending) {
		if (!personCache.has(task.person_id)) {
			const person = await getPersonById(db, task.person_id);
			personCache.set(task.person_id, {
				email: person?.email ?? task.person_id,
				name: person?.name ?? null,
			});
		}
		if (!submissionTitleCache.has(task.submission_id)) {
			const submission = await getSubmissionById(db, task.submission_id);
			const title = submission
				? titleFromAnswers(parseAnswers(submission.answers_json))
				: task.submission_id;
			submissionTitleCache.set(task.submission_id, title);
		}

		const person = personCache.get(task.person_id)!;
		rows.push({
			id: task.id,
			templateKey: task.template_key,
			templateLabel: task.template_label || task.template_key,
			templateKind: task.template_task_kind === "text" ? "text" : "file",
			required: true,
			status: "pending" as const,
			personId: task.person_id,
			personEmail: person.email,
			personName: person.name,
			submissionId: task.submission_id,
			submissionTitle: submissionTitleCache.get(task.submission_id)!,
			updatedAt: task.updated_at,
		});
	}

	const pendingRows = await listPendingCoSpeakersForEvent(db, event.id);
	const pendingCoSpeakers: PendingCoSpeakerItem[] = pendingRows.map((row) => ({
		speakerId: row.id,
		name: row.name,
		email: row.email,
		submissionId: row.submission_id,
		submissionTitle: titleFromAnswers(parseAnswers(row.answers_json)),
		submissionStatus: row.submission_status,
		addedAfterAcceptance: row.added_after_acceptance === 1,
		invitedAt: row.invited_at,
	}));

	const groups = groupOutstandingTasks(rows);
	const pendingSlotAcks = (await listPendingSlotAcksForEvent(db, event.id)).map((row) => ({
		submissionId: row.submission_id,
		submissionTitle: titleFromAnswers(parseAnswers(row.answers_json)),
		personId: row.person_id,
		personName: row.person_name,
		personEmail: row.person_email,
		startsAt: row.starts_at,
		roomName: row.room_name,
	}));
	return {
		eventId: event.id,
		eventSlug: event.slug,
		incompleteCount: rows.length,
		groups,
		pendingCoSpeakers,
		pendingSlotAcks,
		fetchedAt: Date.now(),
	};
}
