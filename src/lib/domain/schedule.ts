export type ScheduleInterval = {
	submissionId: string;
	roomName: string;
	startsAtMs: number;
	endsAtMs: number;
	speakerKeys: readonly string[];
};

export type ScheduleConflict =
	| {
			kind: "room";
			roomName: string;
			submissionIdA: string;
			submissionIdB: string;
	  }
	| {
			kind: "speaker";
			speakerKey: string;
			submissionIdA: string;
			submissionIdB: string;
	  };

export function intervalsOverlap(
	a: Pick<ScheduleInterval, "startsAtMs" | "endsAtMs">,
	b: Pick<ScheduleInterval, "startsAtMs" | "endsAtMs">,
): boolean {
	return a.startsAtMs < b.endsAtMs && b.startsAtMs < a.endsAtMs;
}

export function normalizeSpeakerKey(value: string): string {
	return value.trim().toLowerCase();
}

export function detectConflicts(
	candidate: ScheduleInterval,
	existing: readonly ScheduleInterval[],
): ScheduleConflict[] {
	const conflicts: ScheduleConflict[] = [];
	const candidateRoom = candidate.roomName.trim();
	const candidateSpeakers = new Set(
		candidate.speakerKeys.map(normalizeSpeakerKey).filter(Boolean),
	);

	for (const other of existing) {
		if (other.submissionId === candidate.submissionId) continue;
		if (!intervalsOverlap(candidate, other)) continue;

		if (
			candidateRoom.length > 0 &&
			candidateRoom === other.roomName.trim()
		) {
			conflicts.push({
				kind: "room",
				roomName: candidateRoom,
				submissionIdA: candidate.submissionId,
				submissionIdB: other.submissionId,
			});
		}

		for (const key of other.speakerKeys.map(normalizeSpeakerKey)) {
			if (!key || !candidateSpeakers.has(key)) continue;
			conflicts.push({
				kind: "speaker",
				speakerKey: key,
				submissionIdA: candidate.submissionId,
				submissionIdB: other.submissionId,
			});
		}
	}

	return conflicts;
}

export function formatScheduleConflicts(conflicts: readonly ScheduleConflict[]): string {
	if (conflicts.length === 0) return "No conflicts";
	return conflicts
		.map((conflict) => {
			switch (conflict.kind) {
				case "room":
					return `Room conflict: "${conflict.roomName}" overlaps (${conflict.submissionIdA} vs ${conflict.submissionIdB})`;
				case "speaker":
					return `Speaker conflict: "${conflict.speakerKey}" double-booked (${conflict.submissionIdA} vs ${conflict.submissionIdB})`;
				default: {
					const _exhaustive: never = conflict;
					return _exhaustive;
				}
			}
		})
		.join("; ");
}

export const PUBLIC_SCHEDULE_STATUSES = ["published"] as const;
export type PublicScheduleStatus = (typeof PUBLIC_SCHEDULE_STATUSES)[number];

export function isPublicScheduleStatus(value: string): value is PublicScheduleStatus {
	return (PUBLIC_SCHEDULE_STATUSES as readonly string[]).includes(value);
}

export const SCHEDULABLE_STATUSES = ["accepted", "scheduled", "published"] as const;
export type SchedulableStatus = (typeof SCHEDULABLE_STATUSES)[number];

export function isSchedulableStatus(value: string): value is SchedulableStatus {
	return (SCHEDULABLE_STATUSES as readonly string[]).includes(value);
}

export function durationMinutesFromAnswers(answers: Record<string, unknown>): number {
	const duration = answers.duration_minutes;
	if (typeof duration === "number" && Number.isFinite(duration) && duration > 0) {
		return Math.round(duration);
	}
	if (answers.format === "lightning") return 10;
	return 30;
}

export function titleFromAnswers(answers: Record<string, unknown>): string {
	return typeof answers.title === "string" && answers.title.trim()
		? answers.title.trim()
		: "(untitled)";
}
