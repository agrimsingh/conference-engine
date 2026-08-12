export type OutstandingTaskRow = {
	id: string;
	templateKey: string;
	templateLabel: string;
	templateKind: "text" | "file";
	required: true;
	status: "pending";
	personId: string;
	personEmail: string;
	personName: string | null;
	submissionId: string;
	submissionTitle: string;
	updatedAt: number;
};

export type OutstandingTaskGroup = {
	key: string;
	submissionId: string;
	submissionTitle: string;
	personId: string;
	personEmail: string;
	personName: string | null;
	tasks: OutstandingTaskRow[];
};

/**
 * Unconfirmed co-speakers are outstanding pipeline work — the pipeline
 * never stalls silently, so the dashboard surfaces them next to tasks.
 */
export type PendingCoSpeakerItem = {
	speakerId: string;
	name: string;
	email: string;
	submissionId: string;
	submissionTitle: string;
	submissionStatus: string;
	addedAfterAcceptance: boolean;
	invitedAt: number | null;
};

export type PendingSlotAckItem = {
	submissionId: string;
	submissionTitle: string;
	personId: string;
	personName: string | null;
	personEmail: string;
	startsAt: number;
	roomName: string;
};

export type OutstandingTasksSnapshot = {
	eventId: string;
	eventSlug: string;
	incompleteCount: number;
	groups: OutstandingTaskGroup[];
	pendingCoSpeakers: PendingCoSpeakerItem[];
	pendingSlotAcks: PendingSlotAckItem[];
	fetchedAt: number;
};

export type LiveSyncTransport = "broadcasted" | "polling";

export type EventInvalidateMessage = {
	type: "invalidate";
	reason: string;
	eventId: string;
	at: number;
};

export function outstandingGroupKey(
	submissionId: string,
	personId: string,
): string {
	return `${submissionId}:${personId}`;
}

export function groupOutstandingTasks(
	rows: readonly OutstandingTaskRow[],
): OutstandingTaskGroup[] {
	const map = new Map<string, OutstandingTaskGroup>();

	for (const row of rows) {
		const key = outstandingGroupKey(row.submissionId, row.personId);
		const existing = map.get(key);
		if (!existing) {
			map.set(key, {
				key,
				submissionId: row.submissionId,
				submissionTitle: row.submissionTitle,
				personId: row.personId,
				personEmail: row.personEmail,
				personName: row.personName,
				tasks: [row],
			});
			continue;
		}
		existing.tasks.push(row);
	}

	return [...map.values()].sort((a, b) => {
		const byTitle = a.submissionTitle.localeCompare(b.submissionTitle);
		if (byTitle !== 0) return byTitle;
		return a.personEmail.localeCompare(b.personEmail);
	});
}

export function shouldRefetchOnInvalidate(reason: string): boolean {
	return (
		reason.startsWith("tasks") ||
		reason.startsWith("schedule") ||
		reason.startsWith("review.") ||
		reason.startsWith("email.")
	);
}

export function parseInvalidateMessage(
	raw: string,
): EventInvalidateMessage | null {
	try {
		const parsed: unknown = JSON.parse(raw);
		if (
			typeof parsed !== "object" ||
			parsed === null ||
			!("type" in parsed) ||
			!("reason" in parsed) ||
			!("eventId" in parsed) ||
			!("at" in parsed)
		) {
			return null;
		}
		const candidate = parsed as {
			type: unknown;
			reason: unknown;
			eventId: unknown;
			at: unknown;
		};
		if (
			candidate.type !== "invalidate" ||
			typeof candidate.reason !== "string" ||
			typeof candidate.eventId !== "string" ||
			typeof candidate.at !== "number"
		) {
			return null;
		}
		return {
			type: "invalidate",
			reason: candidate.reason,
			eventId: candidate.eventId,
			at: candidate.at,
		};
	} catch {
		return null;
	}
}
