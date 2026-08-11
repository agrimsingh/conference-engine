import {
	detectConflicts,
	intervalsOverlap,
	type ScheduleInterval,
} from "@/lib/domain";
import { wallTimeToUtcMs } from "@/lib/schedule/time";

export type TrackPlacementInterval = {
	submissionId: string;
	trackId: string | null;
	startsAtMs: number;
	endsAtMs: number;
};

export type UnplacedSearchable = {
	title: string;
	category: string;
	status: string;
	speakerLabels: readonly string[];
};

export type SlotSearchSession = {
	id: string;
	durationMinutes: number;
	speakerKeys: readonly string[];
};

export type AvailableSlot = {
	roomName: string;
	startMinutes: number;
	startsAtMs: number;
	endsAtMs: number;
};

export type PublishConfirmTarget = {
	sessionIds: string[];
	titles: string[];
};

/** Physical main programme stages — not workshop/breakout rooms. */
export function isStageRoom(roomName: string): boolean {
	const normalized = roomName.trim().toLowerCase();
	return normalized === "main stage" || normalized === "demo stage";
}

export type RoomLane = "stages" | "breakouts" | "all";

export function roomsForLane(rooms: readonly string[], lane: RoomLane): string[] {
	if (lane === "all") return [...rooms];
	if (lane === "stages") return rooms.filter(isStageRoom);
	return rooms.filter((room) => !isStageRoom(room));
}

export function isUnplaced(session: { slot: unknown | null }): boolean {
	return session.slot == null;
}

export function unplacedSessions<T extends { slot: unknown | null }>(
	sessions: readonly T[],
): T[] {
	return sessions.filter(isUnplaced);
}

export function matchesUnplacedQuery(
	session: UnplacedSearchable,
	query: string,
): boolean {
	const needle = query.trim().toLowerCase();
	if (!needle) return true;
	const haystack = [
		session.title,
		session.category,
		session.status,
		...session.speakerLabels,
	]
		.join(" ")
		.toLowerCase();
	return haystack.includes(needle);
}

export function filterUnplacedRail<T extends UnplacedSearchable & { slot: unknown | null }>(
	sessions: readonly T[],
	query: string,
): T[] {
	return unplacedSessions(sessions).filter((session) =>
		matchesUnplacedQuery(session, query),
	);
}

function hasHardTrackConflict(input: {
	submissionId: string;
	startsAtMs: number;
	endsAtMs: number;
	trackConflictPolicy: "hard" | "allow";
	placementTrackId: string | null;
	trackIntervals: readonly TrackPlacementInterval[];
}): boolean {
	if (input.trackConflictPolicy !== "hard" || !input.placementTrackId) return false;
	return input.trackIntervals.some(
		(other) =>
			other.submissionId !== input.submissionId &&
			other.trackId === input.placementTrackId &&
			intervalsOverlap(
				{ startsAtMs: input.startsAtMs, endsAtMs: input.endsAtMs },
				other,
			),
	);
}

export function findAvailableSlot(input: {
	session: SlotSearchSession;
	dayKey: string;
	timeZone: string;
	timeRows: readonly number[];
	rooms: readonly string[];
	roomIds: Readonly<Record<string, string>>;
	dayEndMinutes: number;
	intervals: readonly ScheduleInterval[];
	trackConflictPolicy?: "hard" | "allow";
	placementTrackId?: string | null;
	trackIntervals?: readonly TrackPlacementInterval[];
}): AvailableSlot | null {
	const { session, dayKey, timeZone, timeRows, rooms, roomIds, dayEndMinutes, intervals } =
		input;
	const trackConflictPolicy = input.trackConflictPolicy ?? "allow";
	const placementTrackId = input.placementTrackId ?? null;
	const trackIntervals = input.trackIntervals ?? [];
	if (session.durationMinutes <= 0 || rooms.length === 0 || timeRows.length === 0) {
		return null;
	}

	for (const startMinutes of timeRows) {
		if (startMinutes + session.durationMinutes > dayEndMinutes) continue;
		const startsAtMs = wallTimeToUtcMs(dayKey, startMinutes, timeZone);
		const endsAtMs = startsAtMs + session.durationMinutes * 60_000;
		if (
			hasHardTrackConflict({
				submissionId: session.id,
				startsAtMs,
				endsAtMs,
				trackConflictPolicy,
				placementTrackId,
				trackIntervals,
			})
		) {
			continue;
		}

		for (const roomName of rooms) {
			const candidate: ScheduleInterval = {
				submissionId: session.id,
				roomId: roomIds[roomName] ?? null,
				roomName,
				startsAtMs,
				endsAtMs,
				speakerKeys: session.speakerKeys,
			};
			if (detectConflicts(candidate, intervals).length === 0) {
				return { roomName, startMinutes, startsAtMs, endsAtMs };
			}
		}
	}

	return null;
}

export type AutoPlaceAssignment = {
	sessionId: string;
	slot: AvailableSlot;
};

export type AutoPlacePlan = {
	placements: AutoPlaceAssignment[];
	placed: number;
	needAttention: number;
	skippedIds: string[];
};

/** Loop findAvailableSlot over the unscheduled rail; accumulate intervals so later sessions see earlier placements. */
export function planAutoPlace(input: {
	sessions: readonly SlotSearchSession[];
	dayKey: string;
	timeZone: string;
	timeRows: readonly number[];
	rooms: readonly string[];
	roomIds: Readonly<Record<string, string>>;
	dayEndMinutes: number;
	intervals: readonly ScheduleInterval[];
	trackConflictPolicy?: "hard" | "allow";
	placementTrackId?: string | null;
	trackIntervals?: readonly TrackPlacementInterval[];
}): AutoPlacePlan {
	const working: ScheduleInterval[] = [...input.intervals];
	const workingTracks: TrackPlacementInterval[] = [...(input.trackIntervals ?? [])];
	const trackConflictPolicy = input.trackConflictPolicy ?? "allow";
	const placementTrackId = input.placementTrackId ?? null;
	const placements: AutoPlaceAssignment[] = [];
	const skippedIds: string[] = [];

	for (const session of input.sessions) {
		const slot = findAvailableSlot({
			session,
			dayKey: input.dayKey,
			timeZone: input.timeZone,
			timeRows: input.timeRows,
			rooms: input.rooms,
			roomIds: input.roomIds,
			dayEndMinutes: input.dayEndMinutes,
			intervals: working,
			trackConflictPolicy,
			placementTrackId,
			trackIntervals: workingTracks,
		});
		if (!slot) {
			skippedIds.push(session.id);
			continue;
		}
		placements.push({ sessionId: session.id, slot });
		working.push({
			submissionId: session.id,
			roomId: input.roomIds[slot.roomName] ?? null,
			roomName: slot.roomName,
			startsAtMs: slot.startsAtMs,
			endsAtMs: slot.endsAtMs,
			speakerKeys: session.speakerKeys,
		});
		workingTracks.push({
			submissionId: session.id,
			trackId: placementTrackId,
			startsAtMs: slot.startsAtMs,
			endsAtMs: slot.endsAtMs,
		});
	}

	return {
		placements,
		placed: placements.length,
		needAttention: skippedIds.length,
		skippedIds,
	};
}

export function formatAutoPlaceSummary(placed: number, needAttention: number): string {
	return `${placed} placed, ${needAttention} need attention`;
}

export function formatMinutesAsClock(startMinutes: number): string {
	const hours = Math.floor(startMinutes / 60);
	const minutes = startMinutes % 60;
	return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

export type AutoPlacePreviewPlacement = {
	sessionId: string;
	title: string;
	roomName: string;
	startMinutes: number;
	timeLabel: string;
};

export type AutoPlacePreviewSkipped = {
	sessionId: string;
	title: string;
};

export type AutoPlacePreview = {
	willPlace: AutoPlacePreviewPlacement[];
	stillUnplaced: AutoPlacePreviewSkipped[];
};

export type AutoPlaceConfirmTarget = {
	plan: AutoPlacePlan;
	preview: AutoPlacePreview;
};

export function buildAutoPlacePreview(
	plan: AutoPlacePlan,
	sessions: readonly { id: string; title: string }[],
): AutoPlacePreview {
	const titleById = new Map(sessions.map((session) => [session.id, session.title]));
	return {
		willPlace: plan.placements.map(({ sessionId, slot }) => ({
			sessionId,
			title: titleById.get(sessionId) ?? sessionId,
			roomName: slot.roomName,
			startMinutes: slot.startMinutes,
			timeLabel: formatMinutesAsClock(slot.startMinutes),
		})),
		stillUnplaced: plan.skippedIds.map((sessionId) => ({
			sessionId,
			title: titleById.get(sessionId) ?? sessionId,
		})),
	};
}

export function publishableOnDay<
	T extends {
		id: string;
		title: string;
		status: string;
		slot: unknown | null;
		agendaVisibility?: string;
	},
>(daySessions: readonly T[]): T[] {
	return daySessions.filter(
		(session) =>
			session.slot != null &&
			session.status === "scheduled" &&
			session.agendaVisibility !== "private",
	);
}

export function toPublishConfirmTarget(
	sessions: readonly { id: string; title: string }[],
): PublishConfirmTarget {
	return {
		sessionIds: sessions.map((session) => session.id),
		titles: sessions.map((session) => session.title),
	};
}
