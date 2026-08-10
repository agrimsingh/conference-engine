export type ScheduleInterval = {
	submissionId: string;
	/** Stable room identity when the slot belongs to a configured room. */
	roomId: string | null;
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

		const sameRoom = candidate.roomId && other.roomId
			? candidate.roomId === other.roomId
			: candidateRoom.length > 0 && candidateRoom === other.roomName.trim();
		if (sameRoom) {
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

export type ScheduleConflictLabels = {
	titleFor: (submissionId: string) => string;
	/** Optional "09:00–09:30" (or similar) for the conflicting other session. */
	timeRangeFor?: (submissionId: string) => string | null;
};

function defaultSessionLabel(submissionId: string): string {
	return `session ${submissionId.slice(0, 8)}`;
}

export function formatScheduleConflicts(
	conflicts: readonly ScheduleConflict[],
	labels?: ScheduleConflictLabels,
): string {
	if (conflicts.length === 0) return "No conflicts";
	const titleFor = labels?.titleFor ?? defaultSessionLabel;
	const timeRangeFor = labels?.timeRangeFor;
	return conflicts
		.map((conflict) => {
			const a = titleFor(conflict.submissionIdA);
			const b = titleFor(conflict.submissionIdB);
			const when = timeRangeFor?.(conflict.submissionIdB);
			const whenClause = when ? ` (${when})` : "";
			switch (conflict.kind) {
				case "room":
					return `Room conflict in "${conflict.roomName}": "${b}"${whenClause} already occupies that slot, so "${a}" can't go there.`;
				case "speaker": {
					const who =
						conflict.speakerKey.includes("@")
							? conflict.speakerKey
							: `"${conflict.speakerKey}"`;
					return `Speaker conflict: ${who} is already on "${b}"${whenClause}, so they can't also be on "${a}" at the same time.`;
				}
				default: {
					const _exhaustive: never = conflict;
					return _exhaustive;
				}
			}
		})
		.join(" ");
}

/** Human-readable hard track overlap (same track, overlapping times). */
export function formatTrackConflict(args: {
	trackName: string;
	movingTitle: string;
	blockingTitle: string;
	blockingTimeRange: string;
}): string {
	return `Track conflict on "${args.trackName}": "${args.blockingTitle}" already runs ${args.blockingTimeRange}. "${args.movingTitle}" can't share that track at the same time — pick another track or time.`;
}

export const PUBLIC_SCHEDULE_STATUSES = ["published"] as const;
export type PublicScheduleStatus = (typeof PUBLIC_SCHEDULE_STATUSES)[number];

export function isPublicScheduleStatus(value: string): value is PublicScheduleStatus {
	return (PUBLIC_SCHEDULE_STATUSES as readonly string[]).includes(value);
}

/** Match a trimmed room name against configured rooms (empty catalog = free-form ok). */
export function resolveRoom<T extends { id: string; name: string }>(
	rooms: readonly T[],
	name: string,
): { ok: true; room: T | null } | { ok: false; error: string } {
	const roomName = name.trim();
	if (!roomName) {
		return { ok: false, error: "roomName required" };
	}
	if (rooms.length === 0) {
		return { ok: true, room: null };
	}
	const matched = rooms.find((room) => room.name.trim() === roomName);
	if (!matched) {
		const known = rooms.map((room) => room.name.trim()).join(", ");
		return {
			ok: false,
			error: `Unknown room "${roomName}". Use one of: ${known}`,
		};
	}
	return { ok: true, room: matched };
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
