import {
	detectConflicts,
	type ScheduleInterval,
} from "@/lib/domain";
import { wallTimeToUtcMs } from "@/lib/schedule/time";

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

export function findAvailableSlot(input: {
	session: SlotSearchSession;
	dayKey: string;
	timeZone: string;
	timeRows: readonly number[];
	rooms: readonly string[];
	roomIds: Readonly<Record<string, string>>;
	dayEndMinutes: number;
	intervals: readonly ScheduleInterval[];
}): AvailableSlot | null {
	const { session, dayKey, timeZone, timeRows, rooms, roomIds, dayEndMinutes, intervals } =
		input;
	if (session.durationMinutes <= 0 || rooms.length === 0 || timeRows.length === 0) {
		return null;
	}

	for (const startMinutes of timeRows) {
		if (startMinutes + session.durationMinutes > dayEndMinutes) continue;
		const startsAtMs = wallTimeToUtcMs(dayKey, startMinutes, timeZone);
		const endsAtMs = startsAtMs + session.durationMinutes * 60_000;

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
}): AutoPlacePlan {
	const working: ScheduleInterval[] = [...input.intervals];
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

export function publishableOnDay<T extends { id: string; title: string; status: string; slot: unknown | null }>(
	daySessions: readonly T[],
): T[] {
	return daySessions.filter((session) => session.slot != null && session.status === "scheduled");
}

export function toPublishConfirmTarget(
	sessions: readonly { id: string; title: string }[],
): PublishConfirmTarget {
	return {
		sessionIds: sessions.map((session) => session.id),
		titles: sessions.map((session) => session.title),
	};
}
