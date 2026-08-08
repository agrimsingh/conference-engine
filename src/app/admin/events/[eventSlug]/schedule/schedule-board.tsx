"use client";

import { useMemo, useState, useTransition, type DragEvent } from "react";
import { noticeClasses, SegmentedControl } from "@/components/ui";
import {
	detectConflicts,
	formatScheduleConflicts,
	type ScheduleInterval,
} from "@/lib/domain";
import {
	DAY_END_MINUTES,
	DAY_START_MINUTES,
	SLOT_STEP_MINUTES,
	formatClock,
	formatDayLabel,
	wallTimeToUtcMs,
} from "@/lib/schedule/time";

export type ScheduleSession = {
	id: string;
	title: string;
	status: string;
	submitterName: string | null;
	durationMinutes: number;
	speakerKeys: string[];
	speakerLabels: string[];
	slot: {
		roomName: string;
		startsAtMs: number;
		endsAtMs: number;
	} | null;
};

type Props = {
	eventSlug: string;
	timeZone: string;
	dayKey: string;
	rooms: string[];
	sessions: ScheduleSession[];
};

type ViewMode = "day" | "list";

export function ScheduleBoard({
	eventSlug,
	timeZone,
	dayKey,
	rooms,
	sessions: initialSessions,
}: Props) {
	const [sessions, setSessions] = useState(initialSessions);
	const [view, setView] = useState<ViewMode>("day");
	const [roomFilter, setRoomFilter] = useState<string>("all");
	const [selectedId, setSelectedId] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [message, setMessage] = useState<string | null>(null);
	const [pending, startTransition] = useTransition();

	const timeRows = useMemo(() => {
		const rows: number[] = [];
		for (
			let minutes = DAY_START_MINUTES;
			minutes < DAY_END_MINUTES;
			minutes += SLOT_STEP_MINUTES
		) {
			rows.push(minutes);
		}
		return rows;
	}, []);

	const intervals = useMemo((): ScheduleInterval[] => {
		return sessions
			.filter((session) => session.slot)
			.map((session) => ({
				submissionId: session.id,
				roomName: session.slot!.roomName,
				startsAtMs: session.slot!.startsAtMs,
				endsAtMs: session.slot!.endsAtMs,
				speakerKeys: session.speakerKeys,
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

	const pool = useMemo(() => {
		return sessions.filter((session) => {
			if (!session.slot) return true;
			const startDay = new Intl.DateTimeFormat("en-CA", {
				timeZone,
				year: "numeric",
				month: "2-digit",
				day: "2-digit",
			}).format(new Date(session.slot.startsAtMs));
			return startDay !== dayKey;
		});
	}, [sessions, dayKey, timeZone]);

	const listSessions = useMemo(() => {
		const rows = daySessions.filter((session) => {
			if (roomFilter === "all") return true;
			return session.slot?.roomName === roomFilter;
		});
		return rows.sort(
			(a, b) => (a.slot?.startsAtMs ?? 0) - (b.slot?.startsAtMs ?? 0),
		);
	}, [daySessions, roomFilter]);

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

	function placeSession(submissionId: string, roomName: string, startMinutes: number) {
		const session = sessions.find((row) => row.id === submissionId);
		if (!session) return;

		const startsAtMs = wallTimeToUtcMs(dayKey, startMinutes, timeZone);
		const endsAtMs = startsAtMs + session.durationMinutes * 60_000;
		const candidate: ScheduleInterval = {
			submissionId,
			roomName,
			startsAtMs,
			endsAtMs,
			speakerKeys: session.speakerKeys,
		};
		const conflicts = detectConflicts(candidate, intervals);
		if (conflicts.length > 0) {
			setError(formatScheduleConflicts(conflicts));
			setMessage(null);
			return;
		}

		setError(null);
		setMessage(null);
		startTransition(async () => {
			const response = await fetch(
				`/api/admin/events/${eventSlug}/submissions/${submissionId}/schedule`,
				{
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({
						startsAt: startsAtMs,
						endsAt: endsAtMs,
						roomName,
					}),
				},
			);
			const payload: unknown = await response.json();
			if (
				typeof payload !== "object" ||
				payload === null ||
				!("ok" in payload)
			) {
				setError("Schedule failed");
				return;
			}
			const result = payload as {
				ok: boolean;
				error?: string;
				status?: string;
				slot?: {
					room_name: string;
					starts_at: number;
					ends_at: number;
				};
			};
			if (!result.ok || !result.slot) {
				setError(result.error ?? "Schedule failed");
				return;
			}

			setSessions((prev) =>
				prev.map((row) =>
					row.id === submissionId
						? {
								...row,
								status: result.status ?? "scheduled",
								slot: {
									roomName: result.slot!.room_name,
									startsAtMs: result.slot!.starts_at,
									endsAtMs: result.slot!.ends_at,
								},
							}
						: row,
				),
			);
			setSelectedId(null);
			setMessage(`Placed “${session.title}” in ${roomName}`);
		});
	}

	function onDropCell(
		event: DragEvent<HTMLButtonElement>,
		roomName: string,
		startMinutes: number,
	) {
		event.preventDefault();
		const submissionId = event.dataTransfer.getData("text/submission-id");
		if (!submissionId) return;
		placeSession(submissionId, roomName, startMinutes);
	}

	function onClickCell(roomName: string, startMinutes: number) {
		if (!selectedId) return;
		placeSession(selectedId, roomName, startMinutes);
	}

	return (
		<div className="space-y-6">
			<div className="flex flex-wrap items-center gap-3">
				<SegmentedControl
					label="Schedule view"
					value={view}
					options={[
						{ value: "day", label: "Day" },
						{ value: "list", label: "List" },
					]}
					onChange={setView}
				/>
				<p className="text-sm text-neutral-400">
					{formatDayLabel(dayKey, timeZone)} · {timeZone}
				</p>
				<label className="ml-auto flex items-center gap-2 text-sm text-neutral-300">
					Room
					<select
						className="rounded-md border border-neutral-700 bg-neutral-900 px-2 py-1 text-sm text-neutral-100"
						value={roomFilter}
						onChange={(event) => setRoomFilter(event.target.value)}
					>
						<option value="all">All</option>
						{rooms.map((room) => (
							<option key={room} value={room}>
								{room}
							</option>
						))}
					</select>
				</label>
			</div>

			{error ? (
				<p
					role="alert"
					className="rounded-md border border-red-400/60 bg-red-600 px-3 py-2.5 text-sm font-semibold text-white shadow-lg"
				>
					Conflict: {error}
				</p>
			) : null}
			{message ? <p className={noticeClasses("positive")}>{message}</p> : null}
			{pending ? (
				<p className="text-sm text-neutral-500">Saving…</p>
			) : null}

			<section className="rounded-lg border border-neutral-800 bg-neutral-900 p-3">
				<h2 className="mb-2 text-sm font-medium uppercase tracking-wide text-neutral-500">
					Unplaced / other days
				</h2>
				{pool.length === 0 ? (
					<p className="text-sm text-neutral-500">
						All accepted talks are placed on this day.
					</p>
				) : (
					<ul className="flex flex-wrap gap-2">
						{pool.map((session) => (
							<li key={session.id}>
								<button
									type="button"
									draggable
									onDragStart={(event) => {
										event.dataTransfer.setData(
											"text/submission-id",
											session.id,
										);
										event.dataTransfer.effectAllowed = "move";
										setSelectedId(session.id);
									}}
									onClick={() =>
										setSelectedId((prev) =>
											prev === session.id ? null : session.id,
										)
									}
									className={`max-w-xs rounded-md border px-3 py-2 text-left text-sm ${
										selectedId === session.id
											? "border-emerald-500/60 bg-neutral-800 text-neutral-100"
											: "border-neutral-700 bg-neutral-950/60 text-neutral-200 hover:border-neutral-500"
									}`}
								>
									<p className="font-medium">{session.title}</p>
									<p className="mt-0.5 text-xs opacity-80">
										{session.durationMinutes}m · {session.status}
										{session.speakerLabels.length
											? ` · ${session.speakerLabels.join(", ")}`
											: ""}
									</p>
								</button>
							</li>
						))}
					</ul>
				)}
				<p className="mt-2 text-xs text-neutral-500">
					Drag onto a slot, or click a session then click a cell.
				</p>
			</section>

			{view === "day" ? (
				<div className="overflow-x-auto rounded-lg border border-neutral-800 bg-neutral-900">
					<table className="min-w-full border-collapse text-sm">
						<thead>
							<tr className="border-b border-neutral-800 bg-neutral-950/60">
								<th className="sticky left-0 bg-neutral-900 px-2 py-2 text-left font-medium text-neutral-300">
									Time
								</th>
								{rooms
									.filter((room) => roomFilter === "all" || room === roomFilter)
									.map((room) => (
										<th
											key={room}
											className="min-w-40 px-2 py-2 text-left font-medium text-neutral-300"
										>
											{room}
										</th>
									))}
							</tr>
						</thead>
						<tbody>
							{timeRows.map((startMinutes) => {
								const labelMs = wallTimeToUtcMs(dayKey, startMinutes, timeZone);
								const visibleRooms = rooms.filter(
									(room) => roomFilter === "all" || room === roomFilter,
								);
								return (
									<tr
										key={startMinutes}
										className="border-b border-dotted border-neutral-800"
									>
										<td className="sticky left-0 bg-neutral-900 px-2 py-1 font-mono text-xs tabular-nums text-neutral-500">
											{formatClock(labelMs, timeZone)}
										</td>
										{visibleRooms.map((room) => {
											const cellStartMs = wallTimeToUtcMs(
												dayKey,
												startMinutes,
												timeZone,
											);
											const occupant = sessionAt(room, cellStartMs);
											const isStart =
												occupant?.slot?.startsAtMs === cellStartMs;
											return (
												<td key={room} className="p-0 align-top">
													{occupant && !isStart ? (
														<div className="h-10 border-l border-neutral-800 bg-neutral-800/40" />
													) : occupant && isStart ? (
														<div
															draggable
															onDragStart={(event) => {
																event.dataTransfer.setData(
																	"text/submission-id",
																	occupant.id,
																);
																event.dataTransfer.effectAllowed = "move";
																setSelectedId(occupant.id);
															}}
															className="m-0.5 cursor-grab rounded-md border border-neutral-700 bg-neutral-800 px-2 py-1 text-xs text-neutral-100"
															style={{
																minHeight: `${Math.max(
																	1,
																	Math.ceil(
																		occupant.durationMinutes /
																			SLOT_STEP_MINUTES,
																	),
																) * 2.5}rem`,
															}}
														>
															<p className="font-medium">{occupant.title}</p>
															<p className="font-mono tabular-nums opacity-80">
																{formatClock(
																	occupant.slot!.startsAtMs,
																	timeZone,
																)}
																–
																{formatClock(
																	occupant.slot!.endsAtMs,
																	timeZone,
																)}
															</p>
														</div>
													) : (
														<button
															type="button"
															className="flex h-10 w-full items-stretch border border-transparent hover:border-neutral-600 hover:bg-neutral-800/40"
															onDragOver={(event) => event.preventDefault()}
															onDrop={(event) =>
																onDropCell(event, room, startMinutes)
															}
															onClick={() => onClickCell(room, startMinutes)}
															aria-label={`Place in ${room} at ${formatClock(cellStartMs, timeZone)}`}
														/>
													)}
												</td>
											);
										})}
									</tr>
								);
							})}
						</tbody>
					</table>
				</div>
			) : (
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
							</li>
						))
					)}
				</ul>
			)}
		</div>
	);
}
