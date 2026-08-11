"use client";

import {
	DndContext,
	DragOverlay,
	KeyboardSensor,
	PointerSensor,
	closestCenter,
	pointerWithin,
	useSensor,
	useSensors,
	type CollisionDetection,
	type DragEndEvent,
	type DragOverEvent,
	type DragStartEvent,
} from "@dnd-kit/core";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition, type KeyboardEvent } from "react";
import { buttonClasses, INPUT_CLASSES, noticeClasses } from "@/components/ui";
import {
	detectConflicts,
	formatScheduleConflicts,
	formatTrackConflict,
	intervalsOverlap,
	type ScheduleInterval,
} from "@/lib/domain/schedule";
import { buildAgendaReadiness } from "@/lib/schedule/agenda-readiness";
import {
	buildAutoPlacePreview,
	filterUnplacedRail,
	findAvailableSlot,
	formatAutoPlaceSummary,
	planAutoPlace,
	publishableOnDay,
	roomsForLane,
	toPublishConfirmTarget,
	unplacedSessions,
	type AutoPlaceConfirmTarget,
	type PublishConfirmTarget,
	type RoomLane,
} from "@/lib/schedule/board";
import {
	getPlacementFeedback,
	type PlacementFeedbackInput,
} from "@/lib/schedule/placement-feedback";
import {
	formatClock,
	formatDayLabel,
	dayKeyInTimeZone,
	weekDayKeys,
	wallTimeToUtcMs,
} from "@/lib/schedule/time";
import {
	DroppableSlot,
	PlacedDraggableCard,
	SessionDragOverlay,
	UnplacedDraggableChip,
	parseSlotDroppableId,
	slotDroppableId,
} from "./schedule-dnd";
import { SERVICE_BLOCK_DURATIONS } from "@/lib/sessions/service-blocks";
import type { ScheduleSession } from "./schedule-types";

export type { ScheduleSession };

type Props = {
	eventSlug: string;
	timeZone: string;
	dayKey: string;
	days: string[];
	rooms: string[];
	roomIds: Record<string, string>;
	tracks: { id: string; name: string }[];
	trackConflictPolicy: "hard" | "allow";
	dayStartMinutes: number;
	dayEndMinutes: number;
	slotDurationMinutes: number;
	sessions: ScheduleSession[];
	emptyProgrammeHref?: string | null;
};

type ViewMode = "day" | "list" | "week" | "track" | "room";

export function ScheduleBoard({
	eventSlug,
	timeZone,
	dayKey,
	days,
	rooms,
	roomIds,
	tracks,
	trackConflictPolicy,
	dayStartMinutes,
	dayEndMinutes,
	slotDurationMinutes,
	sessions: initialSessions,
	emptyProgrammeHref = null,
}: Props) {
	const router = useRouter();
	const [sessions, setSessions] = useState(initialSessions);
	const [view, setView] = useState<ViewMode>("day");
	const [roomFilter, setRoomFilter] = useState<string>("all");
	const [roomLane, setRoomLane] = useState<RoomLane>("stages");
	const [serviceTitle, setServiceTitle] = useState("");
	const [serviceDurationMinutes, setServiceDurationMinutes] = useState<number>(60);
	const [serviceVisibility, setServiceVisibility] = useState<"public" | "private">("public");
	const [serviceFormOpen, setServiceFormOpen] = useState(false);
	const [trackId, setTrackId] = useState<string>(tracks[0]?.id ?? "");
	const [reassignTrack, setReassignTrack] = useState(false);
	const [selectedId, setSelectedId] = useState<string | null>(null);
	const [railQuery, setRailQuery] = useState("");
	const [publishConfirm, setPublishConfirm] = useState<PublishConfirmTarget | null>(null);
	const [autoPlaceConfirm, setAutoPlaceConfirm] = useState<AutoPlaceConfirmTarget | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [message, setMessage] = useState<string | null>(null);
	const [pending, startTransition] = useTransition();
	const [activeDragId, setActiveDragId] = useState<string | null>(null);
	const [overSlotId, setOverSlotId] = useState<string | null>(null);

	const sensors = useSensors(
		useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
		useSensor(KeyboardSensor),
	);

	const collisionDetection: CollisionDetection = (args) => {
		const pointerHits = pointerWithin(args);
		if (pointerHits.length > 0) return pointerHits;
		return closestCenter(args);
	};

	const timeRows = useMemo(() => {
		const rows: number[] = [];
		for (
			let minutes = dayStartMinutes;
			minutes < dayEndMinutes;
			minutes += slotDurationMinutes
		) {
			rows.push(minutes);
		}
		return rows;
	}, [dayEndMinutes, dayStartMinutes, slotDurationMinutes]);

	const intervals = useMemo((): ScheduleInterval[] => {
		return sessions
			.filter((session) => session.slot)
			.map((session) => ({
				submissionId: session.id,
				roomId: session.slot!.roomId,
				roomName: session.slot!.roomName,
				startsAtMs: session.slot!.startsAtMs,
				endsAtMs: session.slot!.endsAtMs,
				speakerKeys: session.speakerKeys,
			}));
	}, [sessions]);

	const trackIntervals = useMemo(() => {
		return sessions
			.filter((session) => session.slot)
			.map((session) => ({
				submissionId: session.id,
				trackId: session.slot!.trackId,
				startsAtMs: session.slot!.startsAtMs,
				endsAtMs: session.slot!.endsAtMs,
			}));
	}, [sessions]);

	const daySessions = useMemo(() => {
		return sessions.filter((session) => {
			if (!session.slot) return false;
			const startDay = new Intl.DateTimeFormat("en-CA", {
				timeZone,
				year: "numeric",
				month: "2-digit",
				day: "2-digit",
			}).format(new Date(session.slot.startsAtMs));
			return startDay === dayKey;
		});
	}, [sessions, dayKey, timeZone]);

	const pool = useMemo(
		() => filterUnplacedRail(sessions, railQuery),
		[sessions, railQuery],
	);

	const dayPublishable = useMemo(
		() => publishableOnDay(daySessions),
		[daySessions],
	);

	const readiness = useMemo(
		() => buildAgendaReadiness(sessions, { eventSlug }),
		[eventSlug, sessions],
	);
	const conflictStep = readiness.find((step) => step.key === "conflicts");
	const conflictCount = conflictStep?.count ?? 0;

	const selectedSession = useMemo(
		() => sessions.find((session) => session.id === selectedId) ?? null,
		[sessions, selectedId],
	);

	const laneRooms = useMemo(
		() => roomsForLane(rooms, roomLane),
		[roomLane, rooms],
	);

	const visibleDayRooms = useMemo(() => {
		const base =
			roomFilter === "all"
				? laneRooms
				: laneRooms.filter((room) => room === roomFilter);
		// Day grid: only columns that have something placed today (or the
		// single room you're filtering to), so empty breakout rooms don't
		// steal horizontal space from Main/Demo.
		if (view !== "day" || roomFilter !== "all") return base;
		const occupied = new Set(
			daySessions
				.map((session) => session.slot?.roomName)
				.filter((name): name is string => Boolean(name)),
		);
		const withSessions = base.filter((room) => occupied.has(room));
		return withSessions.length > 0 ? withSessions : base;
	}, [daySessions, laneRooms, roomFilter, view]);

	const listSessions = useMemo(() => {
		const rows = daySessions.filter((session) => {
			if (!session.slot) return false;
			if (roomFilter !== "all" && session.slot.roomName !== roomFilter) return false;
			return laneRooms.includes(session.slot.roomName);
		});
		return rows.sort(
			(a, b) => (a.slot?.startsAtMs ?? 0) - (b.slot?.startsAtMs ?? 0),
		);
	}, [daySessions, laneRooms, roomFilter]);

	const groupedSessions = useMemo(() => {
		const visible = sessions.filter((session) => {
			if (!session.slot) return false;
			return roomFilter === "all" || session.slot.roomName === roomFilter;
		});
		const groups = new Map<string, ScheduleSession[]>();
		const add = (key: string, session: ScheduleSession) => groups.set(key, [...(groups.get(key) ?? []), session]);
		if (view === "week") {
			const keys = weekDayKeys(dayKey);
			for (const session of visible) {
				const key = dayKeyInTimeZone(session.slot!.startsAtMs, timeZone);
				if (keys.includes(key)) add(formatDayLabel(key, timeZone), session);
			}
			for (const key of keys) if (![...groups.keys()].includes(formatDayLabel(key, timeZone))) groups.set(formatDayLabel(key, timeZone), []);
		} else if (view === "track") {
			for (const session of daySessions.filter((item) => roomFilter === "all" || item.slot?.roomName === roomFilter)) add(session.slot!.trackName, session);
		} else if (view === "room") {
			for (const session of daySessions.filter((item) => roomFilter === "all" || item.slot?.roomName === roomFilter)) add(session.slot!.roomName, session);
		}
		return [...groups.entries()].map(([label, entries]) => [label, entries.sort((a, b) => a.slot!.startsAtMs - b.slot!.startsAtMs)] as const);
	}, [dayKey, daySessions, roomFilter, sessions, timeZone, view]);

	function sessionAt(roomName: string, startMs: number): ScheduleSession | null {
		return (
			daySessions.find((session) => {
				if (!session.slot) return false;
				if (session.slot.roomName !== roomName) return false;
				return (
					session.slot.startsAtMs <= startMs && startMs < session.slot.endsAtMs
				);
			}) ?? null
		);
	}

	/** Grid rows covered by a placed session — always from agenda slot times. */
	function slotRowSpan(session: ScheduleSession): number {
		if (!session.slot) return 1;
		const durationMs = session.slot.endsAtMs - session.slot.startsAtMs;
		return Math.max(
			1,
			Math.ceil(durationMs / (slotDurationMinutes * 60_000)),
		);
	}

	const ROW_HEIGHT_REM = 2.5;

	function placeSession(submissionId: string, roomName: string, startMinutes: number) {
		const session = sessions.find((row) => row.id === submissionId);
		if (!session) return;

		const startsAtMs = wallTimeToUtcMs(dayKey, startMinutes, timeZone);
		const endsAtMs = startsAtMs + session.durationMinutes * 60_000;
		const nextTrackId =
			session.slot && !reassignTrack ? session.slot.trackId : trackId || null;
		const candidate: ScheduleInterval = {
			submissionId,
			roomId: roomIds[roomName] ?? null,
			roomName,
			startsAtMs,
			endsAtMs,
			speakerKeys: session.speakerKeys,
		};
		const conflictLabels = {
			titleFor: (id: string) =>
				sessions.find((row) => row.id === id)?.title ?? `session ${id.slice(0, 8)}`,
			timeRangeFor: (id: string) => {
				const row = sessions.find((item) => item.id === id);
				if (!row?.slot) return null;
				return `${formatClock(row.slot.startsAtMs, timeZone)}–${formatClock(row.slot.endsAtMs, timeZone)}`;
			},
		};

		const conflicts = detectConflicts(candidate, intervals);
		if (conflicts.length > 0) {
			setError(formatScheduleConflicts(conflicts, conflictLabels));
			setMessage(null);
			return;
		}

		if (trackConflictPolicy === "hard" && nextTrackId) {
			const trackName =
				tracks.find((track) => track.id === nextTrackId)?.name ?? "this track";
			const blocker = sessions.find(
				(row) =>
					row.id !== submissionId &&
					row.slot != null &&
					row.slot.trackId === nextTrackId &&
					intervalsOverlap(candidate, {
						startsAtMs: row.slot.startsAtMs,
						endsAtMs: row.slot.endsAtMs,
					}),
			);
			if (blocker?.slot) {
				setError(
					formatTrackConflict({
						trackName,
						movingTitle: session.title,
						blockingTitle: blocker.title,
						blockingTimeRange: `${formatClock(blocker.slot.startsAtMs, timeZone)}–${formatClock(blocker.slot.endsAtMs, timeZone)}`,
					}),
				);
				setMessage(null);
				return;
			}
		}

		const previous = session;
		const optimisticTrackName =
			tracks.find((track) => track.id === nextTrackId)?.name ??
			session.slot?.trackName ??
			"Unassigned";

		setError(null);
		setMessage(null);
		setSelectedId(null);
		setSessions((prev) =>
			prev.map((row) =>
				row.id === submissionId
					? {
							...row,
							status: row.status === "published" ? "published" : "scheduled",
							durationMinutes: Math.max(
								1,
								Math.round((endsAtMs - startsAtMs) / 60_000),
							),
							slot: {
								roomId: roomIds[roomName] ?? null,
								roomName,
								trackId: nextTrackId,
								trackName: optimisticTrackName,
								startsAtMs,
								endsAtMs,
							},
						}
					: row,
			),
		);

		void (async () => {
			try {
				const response = await fetch(
					`/api/admin/events/${eventSlug}/submissions/${submissionId}/schedule`,
					{
						method: "POST",
						headers: { "content-type": "application/json" },
						body: JSON.stringify({
							startsAt: startsAtMs,
							endsAt: endsAtMs,
							roomName,
							...(session.slot && !reassignTrack ? {} : { trackId: trackId || null }),
						}),
					},
				);
				const payload = await readJson(response);
				if (
					typeof payload !== "object" ||
					payload === null ||
					!("ok" in payload)
				) {
					setSessions((prev) =>
						prev.map((row) => (row.id === submissionId ? previous : row)),
					);
					setError("Schedule failed");
					return;
				}
				const result = payload as PlacementFeedbackInput & {
					ok: boolean;
					error?: string;
					status?: string;
					slot?: {
						room_id: string | null;
						room_name: string;
						track_id: string | null;
						starts_at: number;
						ends_at: number;
					};
				};
				if (!result.ok || !result.slot) {
					setSessions((prev) =>
						prev.map((row) => (row.id === submissionId ? previous : row)),
					);
					setError(result.error ?? "Schedule failed");
					return;
				}

				setSessions((prev) =>
					prev.map((row) =>
						row.id === submissionId
							? {
									...row,
									status: result.status ?? "scheduled",
									durationMinutes: Math.max(
										1,
										Math.round(
											(result.slot!.ends_at - result.slot!.starts_at) / 60_000,
										),
									),
									slot: {
										roomId: result.slot!.room_id,
										roomName: result.slot!.room_name,
										trackId: result.slot!.track_id,
										trackName:
											tracks.find((track) => track.id === result.slot!.track_id)
												?.name ?? "Unassigned",
										startsAtMs: result.slot!.starts_at,
										endsAtMs: result.slot!.ends_at,
									},
								}
							: row,
					),
				);
				setMessage(getPlacementFeedback(result));
			} catch {
				setSessions((prev) =>
					prev.map((row) => (row.id === submissionId ? previous : row)),
				);
				setError(
					"Couldn’t save this schedule change. Check your connection and try again.",
				);
			}
		})();
	}

	function onClickCell(roomName: string, startMinutes: number) {
		if (!selectedId) return;
		placeSession(selectedId, roomName, startMinutes);
	}

	function onDragStart(event: DragStartEvent) {
		const id = String(event.active.id);
		setActiveDragId(id);
		setSelectedId(id);
		setError(null);
	}

	function onDragOver(event: DragOverEvent) {
		const overId = event.over?.id;
		setOverSlotId(
			typeof overId === "string" && parseSlotDroppableId(overId) ? overId : null,
		);
	}

	function onDragEnd(event: DragEndEvent) {
		const submissionId = String(event.active.id);
		const slot = parseSlotDroppableId(event.over?.id ?? null);
		setActiveDragId(null);
		setOverSlotId(null);
		if (!slot) return;
		placeSession(submissionId, slot.roomName, slot.startMinutes);
	}

	function onDragCancel() {
		setActiveDragId(null);
		setOverSlotId(null);
	}

	const activeDragSession =
		activeDragId == null
			? null
			: (sessions.find((session) => session.id === activeDragId) ?? null);

	function onCardKeyDown(event: KeyboardEvent<HTMLElement>, submissionId: string) {
		if (event.key !== "Enter" && event.key !== " ") return;
		event.preventDefault();
		setSelectedId((current) => current === submissionId ? null : submissionId);
	}

	function requestPublish(targets: readonly ScheduleSession[]) {
		if (targets.length === 0) {
			setError("No scheduled sessions to publish.");
			return;
		}
		setError(null);
		setPublishConfirm(toPublishConfirmTarget(targets));
	}

	function createServiceBlock() {
		const title = serviceTitle.trim();
		if (!title) {
			setError("Service block title is required.");
			return;
		}
		setError(null);
		setMessage(null);
		startTransition(async () => {
			try {
				const response = await fetch(`/api/admin/events/${eventSlug}/service-blocks`, {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({
						title,
						durationMinutes: serviceDurationMinutes,
						agendaVisibility: serviceVisibility,
					}),
				});
				const payload = await readJson<{
					ok?: boolean;
					error?: string;
					submissionId?: string;
					title?: string;
					durationMinutes?: number;
					agendaVisibility?: "public" | "private";
				}>(response);
				if (!response.ok || !payload?.ok || !payload.submissionId) {
					setError(payload?.error ?? "Could not create service block");
					return;
				}
				const next: ScheduleSession = {
					id: payload.submissionId,
					title: payload.title ?? title,
					category: "Uncategorized",
					status: "accepted",
					contentStatus: null,
					submitterName: null,
					durationMinutes: payload.durationMinutes ?? serviceDurationMinutes,
					speakerKeys: [],
					speakerLabels: [],
					itemKind: "service",
					agendaVisibility: payload.agendaVisibility ?? serviceVisibility,
					slot: null,
				};
				setSessions((previous) => [next, ...previous]);
				setServiceTitle("");
				setServiceFormOpen(false);
				setSelectedId(next.id);
				setMessage("Service block added to the unplaced rail.");
			} catch {
				setError("Couldn’t create service block. Check your connection and try again.");
			}
		});
	}

	function findSlotForSelected() {
		if (!selectedSession) {
			setError("Select a session first.");
			return;
		}
		const slot = findAvailableSlot({
			session: selectedSession,
			dayKey,
			timeZone,
			timeRows,
			rooms: visibleDayRooms,
			roomIds,
			dayEndMinutes,
			intervals,
			trackConflictPolicy,
			placementTrackId: trackId || null,
			trackIntervals,
		});
		if (!slot) {
			setError("No open slot on this day for the selected session.");
			setMessage(null);
			return;
		}
		placeSession(selectedSession.id, slot.roomName, slot.startMinutes);
	}

	function autoPlaceRail() {
		const rail = unplacedSessions(sessions);
		if (rail.length === 0) {
			setError(null);
			setMessage(formatAutoPlaceSummary(0, 0));
			return;
		}

		const roomsForPlacement =
			roomFilter === "all"
				? laneRooms
				: laneRooms.filter((room) => room === roomFilter);

		const plan = planAutoPlace({
			sessions: rail,
			dayKey,
			timeZone,
			timeRows,
			rooms: roomsForPlacement,
			roomIds,
			dayEndMinutes,
			intervals,
			trackConflictPolicy,
			placementTrackId: trackId || null,
			trackIntervals,
		});

		setError(null);
		setMessage(null);
		setAutoPlaceConfirm({
			plan,
			preview: buildAutoPlacePreview(plan, rail),
		});
	}

	function confirmAutoPlace() {
		if (!autoPlaceConfirm || autoPlaceConfirm.plan.placements.length === 0) return;
		const { plan } = autoPlaceConfirm;
		const rail = unplacedSessions(sessions);
		setAutoPlaceConfirm(null);
		setSelectedId(null);
		setError(null);
		setMessage(formatAutoPlaceSummary(plan.placed, plan.needAttention));

		const placementById = new Map(
			plan.placements.map((row) => [row.sessionId, row.slot] as const),
		);
		const previousById = new Map(
			rail
				.filter((session) => placementById.has(session.id))
				.map((session) => [session.id, session] as const),
		);
		const nextTrackId = trackId || null;
		const optimisticTrackName =
			tracks.find((track) => track.id === nextTrackId)?.name ?? "Unassigned";

		setSessions((previous) =>
			previous.map((row) => {
				const slot = placementById.get(row.id);
				if (!slot) return row;
				return {
					...row,
					status: row.status === "published" ? "published" : "scheduled",
					durationMinutes: Math.max(
						1,
						Math.round((slot.endsAtMs - slot.startsAtMs) / 60_000),
					),
					slot: {
						roomId: roomIds[slot.roomName] ?? null,
						roomName: slot.roomName,
						trackId: nextTrackId,
						trackName: optimisticTrackName,
						startsAtMs: slot.startsAtMs,
						endsAtMs: slot.endsAtMs,
					},
				};
			}),
		);

		startTransition(async () => {
			let failed = 0;
			await Promise.all(
				plan.placements.map(async ({ sessionId, slot }) => {
					const previous = previousById.get(sessionId);
					if (!previous) return;
					try {
						const response = await fetch(
							`/api/admin/events/${eventSlug}/submissions/${sessionId}/schedule`,
							{
								method: "POST",
								headers: { "content-type": "application/json" },
								body: JSON.stringify({
									startsAt: slot.startsAtMs,
									endsAt: slot.endsAtMs,
									roomName: slot.roomName,
									trackId: nextTrackId,
								}),
							},
						);
						const payload = await readJson(response);
						if (
							typeof payload !== "object" ||
							payload === null ||
							!("ok" in payload)
						) {
							failed += 1;
							setSessions((prev) =>
								prev.map((row) => (row.id === sessionId ? previous : row)),
							);
							return;
						}
						const result = payload as PlacementFeedbackInput & {
							ok: boolean;
							error?: string;
							status?: string;
							slot?: {
								room_id: string | null;
								room_name: string;
								track_id: string | null;
								starts_at: number;
								ends_at: number;
							};
						};
						if (!result.ok || !result.slot) {
							failed += 1;
							setSessions((prev) =>
								prev.map((row) => (row.id === sessionId ? previous : row)),
							);
							return;
						}
						setSessions((prev) =>
							prev.map((row) =>
								row.id === sessionId
									? {
											...row,
											status: result.status ?? "scheduled",
											durationMinutes: Math.max(
												1,
												Math.round(
													(result.slot!.ends_at - result.slot!.starts_at) /
														60_000,
												),
											),
											slot: {
												roomId: result.slot!.room_id,
												roomName: result.slot!.room_name,
												trackId: result.slot!.track_id,
												trackName:
													tracks.find(
														(track) => track.id === result.slot!.track_id,
													)?.name ?? "Unassigned",
												startsAtMs: result.slot!.starts_at,
												endsAtMs: result.slot!.ends_at,
											},
										}
									: row,
							),
						);
					} catch {
						failed += 1;
						setSessions((prev) =>
							prev.map((row) => (row.id === sessionId ? previous : row)),
						);
					}
				}),
			);

			const placed = plan.placed - failed;
			const needAttention = plan.needAttention + failed;
			setMessage(formatAutoPlaceSummary(placed, needAttention));
			if (failed > 0) {
				setError(
					"Some sessions couldn’t be saved. Check your connection and try again.",
				);
			}
		});
	}

	function mutateAction(submissionId: string, action: "unplace" | "unpublish") {
		setError(null);
		startTransition(async () => {
			try {
			const response = await fetch(`/api/admin/events/${eventSlug}/submissions/${submissionId}/schedule`, {
				method: action === "unplace" ? "DELETE" : "PATCH",
				headers: { "content-type": "application/json" },
				body: action === "unplace" ? undefined : JSON.stringify({ action }),
			});
			const payload = await readJson<{ ok?: boolean; error?: string; status?: string }>(response);
			if (!response.ok || !payload?.ok) { setError(payload?.error ?? "Schedule update failed"); return; }
			setSessions((previous) => previous.map((session) => session.id !== submissionId ? session : action === "unplace" ? { ...session, status: payload.status ?? "accepted", slot: null } : { ...session, status: payload.status ?? session.status }));
			setMessage(action === "unplace" ? "Session returned to the unplaced rail." : "Session is no longer public.");
			} catch {
				setError("Couldn’t save this schedule change. Check your connection and try again.");
			}
		});
	}

	function confirmPublish() {
		if (!publishConfirm || publishConfirm.sessionIds.length === 0) return;
		const ids = publishConfirm.sessionIds;
		const count = ids.length;
		setPublishConfirm(null);
		setError(null);
		startTransition(async () => {
			try {
				if (ids.length === 1) {
					const submissionId = ids[0]!;
					const response = await fetch(
						`/api/admin/events/${eventSlug}/submissions/${submissionId}/schedule`,
						{
							method: "PATCH",
							headers: { "content-type": "application/json" },
							body: JSON.stringify({ action: "publish", approveContent: true }),
						},
					);
					const payload = await readJson<{ ok?: boolean; error?: string; status?: string }>(
						response,
					);
					if (!response.ok || !payload?.ok) {
						setError(payload?.error ?? "Publish failed");
						return;
					}
					setSessions((previous) =>
						previous.map((session) =>
							session.id !== submissionId
								? session
								: {
										...session,
										status: payload.status ?? "published",
										contentStatus: "approved",
									},
						),
					);
					setMessage("Session is now public.");
					return;
				}

				const response = await fetch(
					`/api/admin/events/${eventSlug}/sessions/bulk-publish`,
					{
						method: "POST",
						headers: { "content-type": "application/json" },
						body: JSON.stringify({ action: "publish", sessionIds: ids, approveContent: true }),
					},
				);
				const payload = await readJson<{
					ok?: boolean;
					error?: string;
					changed?: number;
				}>(response);
				if (!response.ok || !payload?.ok) {
					setError(payload?.error ?? "Bulk publish failed");
					return;
				}
				const idSet = new Set(ids);
				setSessions((previous) =>
					previous.map((session) =>
						idSet.has(session.id)
							? { ...session, status: "published", contentStatus: "approved" }
							: session,
					),
				);
				setMessage(`Published ${payload.changed ?? count} sessions.`);
			} catch {
				setError("Couldn’t publish. Check your connection and try again.");
			}
		});
	}

	return (
		<DndContext
			sensors={sensors}
			collisionDetection={collisionDetection}
			onDragStart={onDragStart}
			onDragOver={onDragOver}
			onDragEnd={onDragEnd}
			onDragCancel={onDragCancel}
		>
		<div className="space-y-6">
			<nav aria-label="Agenda readiness" className="border-b border-neutral-900 pb-3">
				<ol className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-neutral-400">
					{readiness.map((step, index) => (
						<li key={step.key} className="flex items-center gap-2">
							{index > 0 ? (
								<span aria-hidden="true" className="text-neutral-700">
									→
								</span>
							) : null}
							{step.href ? (
								<a
									href={step.href}
									className={
										step.complete
											? "text-neutral-500 hover:text-neutral-300"
											: step.key === "conflicts" && step.count > 0
												? "text-amber-300/90 hover:text-amber-200"
												: "text-neutral-200 hover:text-white"
									}
								>
									{step.label}{" "}
									<span className="tabular-nums">{step.count}</span>
								</a>
							) : (
								<span className={step.complete ? "text-neutral-500" : "text-neutral-200"}>
									{step.label}{" "}
									<span className="tabular-nums">{step.count}</span>
								</span>
							)}
						</li>
					))}
				</ol>
			</nav>
			{conflictCount > 0 ? (
				<p id="conflicts" className="scroll-mt-4 text-sm text-amber-300/80">
					{conflictCount} {conflictCount === 1 ? "session overlaps" : "sessions overlap"} on
					room or speaker.
				</p>
			) : (
				<div id="conflicts" className="scroll-mt-4" />
			)}
			<div className="flex flex-wrap items-center gap-3">
				<label className="flex items-center gap-2 text-sm text-neutral-300">
					View
					<select
						value={view}
						onChange={(event) => setView(event.target.value as ViewMode)}
						className={INPUT_CLASSES}
						aria-label="Schedule view"
					>
						<option value="day">Day grid</option>
						<option value="list">List</option>
						<option value="week">Week</option>
						<option value="track">Track</option>
						<option value="room">Room</option>
					</select>
				</label>
				<label className="flex items-center gap-2 text-sm text-neutral-300">
					Day
					<select
						value={dayKey}
						onChange={(event) => router.push(`/admin/events/${eventSlug}/schedule?day=${event.target.value}`)}
						className={INPUT_CLASSES}
						aria-label="Schedule day"
					>
						{days.map((day) => (
							<option key={day} value={day}>{formatDayLabel(day, timeZone)}</option>
						))}
					</select>
				</label>
				<p className="text-sm text-neutral-400">
					{formatDayLabel(dayKey, timeZone)} · {timeZone}
				</p>
				<label className="ml-auto flex items-center gap-2 text-sm text-neutral-300">
					Lanes
					<select
						className={INPUT_CLASSES}
						value={roomLane}
						onChange={(event) => {
							setRoomLane(event.target.value as RoomLane);
							setRoomFilter("all");
						}}
						aria-label="Room lanes"
					>
						<option value="stages">Stages (Main / Demo)</option>
						<option value="breakouts">Breakouts (workshops / leadership)</option>
						<option value="all">All rooms</option>
					</select>
				</label>
				<label className="flex items-center gap-2 text-sm text-neutral-300">
					Room
					<select
						className={INPUT_CLASSES}
						value={roomFilter}
						onChange={(event) => setRoomFilter(event.target.value)}
					>
						<option value="all">All in lane</option>
						{laneRooms.map((room) => (
							<option key={room} value={room}>
								{room}
							</option>
						))}
					</select>
				</label>
				<label className="flex items-center gap-2 text-sm text-neutral-300">
					Track for new placements
					<select className={INPUT_CLASSES} value={trackId} onChange={(event) => setTrackId(event.target.value)}>
						{tracks.map((track) => <option key={track.id} value={track.id}>{track.name}</option>)}
					</select>
				</label>
				<label className="flex items-center gap-2 text-sm text-neutral-300">
					<input type="checkbox" checked={reassignTrack} onChange={(event) => setReassignTrack(event.target.checked)} />
					Apply selected track when moving a session
				</label>
			</div>

			{error ? (
				<p role="alert" className={noticeClasses("negative")}>
					{error}
				</p>
			) : null}
			{message ? <p className={noticeClasses("positive")}>{message}</p> : null}

			<section id="unplaced" className="scroll-mt-4 border-b border-neutral-800 pb-4">
				{emptyProgrammeHref && sessions.length === 0 ? (
					<p className="mb-3 text-sm text-neutral-400">
						No accepted talks yet.{" "}
						<a href={emptyProgrammeHref} className="text-neutral-200 underline underline-offset-2">
							Open submissions
						</a>{" "}
						or add a service block below.
					</p>
				) : null}
				<div className="mb-3 rounded-md border border-neutral-800 bg-neutral-950/40 p-3">
					<div className="flex flex-wrap items-center gap-2">
						<h2 className="text-sm font-medium text-neutral-300">Add service block</h2>
						<button
							type="button"
							className={`${buttonClasses("secondary", "sm")} ml-auto`}
							onClick={() => setServiceFormOpen((open) => !open)}
							aria-expanded={serviceFormOpen}
						>
							{serviceFormOpen ? "Hide" : "Add"}
						</button>
					</div>
					{serviceFormOpen ? (
						<div className="mt-3 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto_auto_auto] sm:items-end">
							<label className="block text-sm text-neutral-300">
								Title
								<input
									type="text"
									value={serviceTitle}
									onChange={(event) => setServiceTitle(event.target.value)}
									placeholder="Lunch, break, registration…"
									className={`mt-1 w-full ${INPUT_CLASSES}`}
									maxLength={240}
								/>
							</label>
							<label className="block text-sm text-neutral-300">
								Duration
								<select
									className={`mt-1 ${INPUT_CLASSES}`}
									value={serviceDurationMinutes}
									onChange={(event) => setServiceDurationMinutes(Number(event.target.value))}
								>
									{SERVICE_BLOCK_DURATIONS.map((minutes) => (
										<option key={minutes} value={minutes}>
											{minutes}m
										</option>
									))}
								</select>
							</label>
							<label className="block text-sm text-neutral-300">
								Visibility
								<select
									className={`mt-1 ${INPUT_CLASSES}`}
									value={serviceVisibility}
									onChange={(event) =>
										setServiceVisibility(event.target.value === "private" ? "private" : "public")
									}
								>
									<option value="public">Public</option>
									<option value="private">Private</option>
								</select>
							</label>
							<button
								type="button"
								disabled={pending || !serviceTitle.trim()}
								onClick={createServiceBlock}
								className={buttonClasses("primary", "sm")}
							>
								Create
							</button>
						</div>
					) : null}
				</div>
				<div className="mb-2 flex flex-wrap items-center gap-2">
					<h2 className="text-sm font-medium uppercase tracking-wide text-neutral-500">
						Unplaced
					</h2>
					<label className="ml-auto flex min-w-48 flex-1 items-center gap-2 text-sm text-neutral-300 sm:max-w-xs">
						<span className="sr-only">Filter unplaced</span>
						<input
							type="search"
							value={railQuery}
							onChange={(event) => setRailQuery(event.target.value)}
							placeholder="Filter title, speaker…"
							className={`w-full ${INPUT_CLASSES}`}
						/>
					</label>
					<button
						type="button"
						disabled={!selectedSession || pending}
						onClick={findSlotForSelected}
						className={buttonClasses("secondary", "sm")}
					>
						Find available slot
					</button>
					<button
						type="button"
						disabled={unplacedSessions(sessions).length === 0 || pending}
						onClick={autoPlaceRail}
						className={buttonClasses("secondary", "sm")}
						aria-label="Auto-place Auto-schedule"
						data-testid="auto-place"
					>
						Auto-place
					</button>
					<button
						id="publish"
						type="button"
						disabled={dayPublishable.length === 0 || pending}
						onClick={() => requestPublish(dayPublishable)}
						className={`${buttonClasses("secondary", "sm")} scroll-mt-4`}
					>
						Publish day ({dayPublishable.length})
					</button>
				</div>
				{pool.length === 0 ? (
					<p className="text-sm text-neutral-500">
						{railQuery.trim()
							? "No unplaced sessions match this filter."
							: "No unplaced sessions. Talks placed on other days stay on those days."}
					</p>
				) : (
					<ul className="flex flex-wrap gap-2">
						{pool.map((session) => (
							<UnplacedDraggableChip
								key={session.id}
								session={session}
								selected={selectedId === session.id}
								onSelect={() =>
									setSelectedId((prev) =>
										prev === session.id ? null : session.id,
									)
								}
							/>
						))}
					</ul>
				)}
				<p className="mt-2 text-xs text-neutral-500">
					Drag onto a slot, click a session then a cell, use Find available slot, or Auto-place / Auto-schedule the rail.
				</p>
			</section>

			{publishConfirm ? (
				<div
					role="dialog"
					aria-modal="true"
					aria-labelledby="publish-confirm-title"
					className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
				>
					<div className="w-full max-w-md space-y-3 rounded-lg border border-neutral-700 bg-neutral-900 p-4 shadow-xl">
						<h2 id="publish-confirm-title" className="text-base font-medium text-neutral-100">
							Publish {publishConfirm.sessionIds.length}{" "}
							{publishConfirm.sessionIds.length === 1 ? "session" : "sessions"}?
						</h2>
						<p className="text-sm text-neutral-400">
							This publishes the selected sessions to the public schedule and locks in their current content. Later edits stay private until you publish again.
						</p>
						<ul className="max-h-40 list-disc space-y-1 overflow-y-auto pl-5 text-sm text-neutral-300">
							{publishConfirm.titles.map((title, index) => (
								<li key={`${publishConfirm.sessionIds[index]}-${title}`}>{title}</li>
							))}
						</ul>
						<div className="flex justify-end gap-2">
							<button
								type="button"
								disabled={pending}
								onClick={() => setPublishConfirm(null)}
								className={buttonClasses("secondary", "sm")}
							>
								Cancel
							</button>
							<button
								type="button"
								disabled={pending}
								onClick={confirmPublish}
								className={buttonClasses("primary", "sm")}
							>
								Approve &amp; publish {publishConfirm.sessionIds.length}
							</button>
						</div>
					</div>
				</div>
			) : null}

			{autoPlaceConfirm ? (
				<div
					role="dialog"
					aria-modal="true"
					aria-labelledby="auto-place-confirm-title"
					className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
				>
					<div className="w-full max-w-md space-y-3 rounded-lg border border-neutral-700 bg-neutral-900 p-4 shadow-xl">
						<h2
							id="auto-place-confirm-title"
							className="text-base font-medium text-neutral-100"
						>
							Auto-place preview
						</h2>
						<p className="text-sm text-neutral-400">
							{formatAutoPlaceSummary(
								autoPlaceConfirm.plan.placed,
								autoPlaceConfirm.plan.needAttention,
							)}
						</p>
						{autoPlaceConfirm.preview.willPlace.length > 0 ? (
							<div className="space-y-1">
								<p className="text-xs font-medium uppercase tracking-wide text-neutral-500">
									Will place
								</p>
								<ul className="max-h-40 list-disc space-y-1 overflow-y-auto pl-5 text-sm text-neutral-300">
									{autoPlaceConfirm.preview.willPlace.map((row) => (
										<li key={row.sessionId}>
											{row.title}
											<span className="text-neutral-500">
												{" "}
												· {row.roomName} · {row.timeLabel}
											</span>
										</li>
									))}
								</ul>
							</div>
						) : null}
						{autoPlaceConfirm.preview.stillUnplaced.length > 0 ? (
							<div className="space-y-1">
								<p className="text-xs font-medium uppercase tracking-wide text-neutral-500">
									Still unplaced
								</p>
								<ul className="max-h-40 list-disc space-y-1 overflow-y-auto pl-5 text-sm text-neutral-300">
									{autoPlaceConfirm.preview.stillUnplaced.map((row) => (
										<li key={row.sessionId}>{row.title}</li>
									))}
								</ul>
							</div>
						) : null}
						{autoPlaceConfirm.plan.placements.length === 0 ? (
							<p className={noticeClasses("warning")}>
								No open slots for these sessions on this day with the current room filter.
							</p>
						) : null}
						<div className="flex justify-end gap-2">
							<button
								type="button"
								disabled={pending}
								onClick={() => setAutoPlaceConfirm(null)}
								className={buttonClasses("secondary", "sm")}
							>
								Cancel
							</button>
							<button
								type="button"
								disabled={pending || autoPlaceConfirm.plan.placements.length === 0}
								onClick={confirmAutoPlace}
								className={buttonClasses("primary", "sm")}
								data-testid="auto-place-apply"
							>
								Apply {autoPlaceConfirm.plan.placements.length}
							</button>
						</div>
					</div>
				</div>
			) : null}

			{view === "week" || view === "track" || view === "room" ? (
				<div className={view === "week" ? "grid gap-0 divide-x divide-neutral-800 border border-neutral-800 sm:grid-cols-2 lg:grid-cols-7" : "divide-y divide-neutral-800 border border-neutral-800"}>
					{groupedSessions.map(([label, entries]) => (
						<section key={label} className={`min-h-28 p-3 ${view === "week" ? "border-neutral-800 first:border-l-0" : ""}`}>
							<h2 className="mb-3 border-b border-neutral-800 pb-2 text-xs font-medium uppercase tracking-wide text-neutral-500">{label}</h2>
							{entries.length === 0 ? <p className="text-xs text-neutral-500">No sessions</p> : <ul className="divide-y divide-neutral-800">{entries.map((session) => <li key={session.id} className="py-2 text-xs"><p className="font-medium text-neutral-100">{session.title}</p><p className="mt-0.5 font-mono text-neutral-500">{formatClock(session.slot!.startsAtMs, timeZone)}–{formatClock(session.slot!.endsAtMs, timeZone)} · {session.slot!.roomName}</p><p className="mt-0.5 text-neutral-500">{session.category}</p></li>)}</ul>}
						</section>
					))}
				</div>
			) : null}

			{view === "day" ? (
				<div className="overflow-x-auto rounded-lg border border-neutral-800 bg-neutral-900">
					<table className="w-full min-w-[40rem] table-fixed border-collapse text-sm">
						<thead>
							<tr className="border-b border-neutral-800 bg-neutral-950/60">
								<th className="sticky left-0 w-16 bg-neutral-900 px-2 py-2 text-left font-medium text-neutral-300">
									Time
								</th>
								{visibleDayRooms.map((room) => (
										<th
											key={room}
											className="px-2 py-2 text-left font-medium text-neutral-300"
										>
											{room}
										</th>
									))}
							</tr>
						</thead>
						<tbody>
							{timeRows.map((startMinutes) => {
								const labelMs = wallTimeToUtcMs(dayKey, startMinutes, timeZone);
								return (
									<tr
										key={startMinutes}
										className="border-b border-dotted border-neutral-800"
										style={{ height: `${ROW_HEIGHT_REM}rem` }}
									>
										<td className="sticky left-0 w-16 bg-neutral-900 px-2 py-1 font-mono text-xs tabular-nums text-neutral-500">
											{formatClock(labelMs, timeZone)}
										</td>
										{visibleDayRooms.map((room) => {
											const cellStartMs = wallTimeToUtcMs(
												dayKey,
												startMinutes,
												timeZone,
											);
											const occupant = sessionAt(room, cellStartMs);
											const isStart =
												occupant?.slot?.startsAtMs === cellStartMs;
											// Covered by a rowspan from an earlier row — omit the <td>.
											if (occupant && !isStart) return null;

											const droppableId = slotDroppableId(room, startMinutes);
											if (occupant && isStart) {
												const span = slotRowSpan(occupant);
												return (
													<td
														key={room}
														rowSpan={span}
														className="w-[1%] p-0 align-top"
														style={{ height: `${span * ROW_HEIGHT_REM}rem` }}
													>
														<PlacedDraggableCard
															session={occupant}
															selected={selectedId === occupant.id}
															minHeightRem={span * ROW_HEIGHT_REM}
															timeLabel={`${formatClock(occupant.slot!.startsAtMs, timeZone)}–${formatClock(occupant.slot!.endsAtMs, timeZone)}`}
															onSelect={() =>
																setSelectedId((prev) =>
																	prev === occupant.id ? null : occupant.id,
																)
															}
															onKeyDown={(event) =>
																onCardKeyDown(event, occupant.id)
															}
														/>
													</td>
												);
											}

											return (
												<td key={room} className="w-[1%] p-0 align-top">
													<DroppableSlot
														id={droppableId}
														isOver={overSlotId === droppableId}
														onClick={() => onClickCell(room, startMinutes)}
														ariaLabel={`Place in ${room} at ${formatClock(cellStartMs, timeZone)}`}
													/>
												</td>
											);
										})}
									</tr>
								);
							})}
						</tbody>
					</table>
				</div>
				) : view === "list" ? (
					<ul className="divide-y divide-neutral-800 rounded-lg border border-neutral-800 bg-neutral-900">
					{listSessions.length === 0 ? (
						<li className="px-4 py-8 text-center text-sm text-neutral-400">
							<p className="font-medium text-neutral-100">No sessions on this day</p>
							<p className="mt-1">Drag a talk from the pool onto the day grid.</p>
						</li>
					) : (
							listSessions.map((session) => (
								<li key={session.id} className="px-4 py-3 text-sm">
								<p className="font-medium text-neutral-100">{session.title}</p>
								<p className="mt-1 text-neutral-400">
									<span className="font-mono text-xs tabular-nums">
										{formatClock(session.slot!.startsAtMs, timeZone)}–
										{formatClock(session.slot!.endsAtMs, timeZone)}
									</span>{" "}
									· {session.slot!.roomName}
									{session.speakerLabels.length
										? ` · ${session.speakerLabels.join(", ")}`
										: ""}
								</p>
								<div className="mt-2 flex flex-wrap gap-2">
									<button type="button" className={buttonClasses("secondary", "sm")} onClick={() => mutateAction(session.id, "unplace")}>Unschedule</button>
									{session.status === "published" ? (
										<button type="button" className={buttonClasses("secondary", "sm")} onClick={() => mutateAction(session.id, "unpublish")}>Unpublish</button>
									) : session.status === "scheduled" ? (
										<button type="button" className={buttonClasses("secondary", "sm")} onClick={() => requestPublish([session])}>Publish</button>
									) : null}
								</div>
								</li>
							))
						)}
					</ul>
				) : null}
		</div>
		<DragOverlay dropAnimation={null}>
			<SessionDragOverlay session={activeDragSession} />
		</DragOverlay>
		</DndContext>
	);
}

async function readJson<T = unknown>(response: Response): Promise<T | null> {
	try {
		return await response.json() as T;
	} catch {
		return null;
	}
}
