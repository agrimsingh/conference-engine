import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb } from "@/lib/db/cloudflare";
import {
	getEventBySlug,
	listAgendaSlotsWithSubmissions,
	listEventRooms,
	listSpeakersForSubmission,
} from "@/lib/db/queries";
import {
	AIE_CATEGORY_LABELS,
	UNCATEGORIZED_CATEGORY,
	displayCategory,
	isPublicScheduleStatus,
	titleFromAnswers,
} from "@/lib/domain";
import {
	DEMO_SCHEDULE_DAY,
	dayKeyInTimeZone,
	formatClock,
	formatDayLabel,
	parseDayKey,
	weekDayKeys,
} from "@/lib/schedule/time";

type ScheduleView = "list" | "day" | "week" | "track" | "room";

type Props = {
	params: Promise<{ eventSlug: string }>;
	searchParams: Promise<{ day?: string; view?: string; room?: string }>;
};

type EnrichedSlot = {
	id: string;
	submissionId: string;
	title: string;
	roomName: string;
	category: string;
	startsAtMs: number;
	endsAtMs: number;
	status: string;
	speakers: string[];
	dayKey: string;
};

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

function parseView(value: string | undefined): ScheduleView {
	switch (value) {
		case "day":
		case "week":
		case "track":
		case "room":
		case "list":
			return value;
		default:
			return "list";
	}
}

function viewLabel(view: ScheduleView): string {
	switch (view) {
		case "list":
			return "List";
		case "day":
			return "Day";
		case "week":
			return "Week";
		case "track":
			return "Track";
		case "room":
			return "Room";
		default: {
			const _exhaustive: never = view;
			return _exhaustive;
		}
	}
}

function hrefFor(
	eventSlug: string,
	args: { day: string; view: ScheduleView; room: string },
): string {
	const params = new URLSearchParams();
	params.set("day", args.day);
	params.set("view", args.view);
	if (args.room !== "all") params.set("room", args.room);
	return `/e/${eventSlug}/schedule?${params.toString()}`;
}

function SlotCard({
	slot,
	timezone,
	showRoom,
	showCategory,
}: {
	slot: EnrichedSlot;
	timezone: string;
	showRoom?: boolean;
	showCategory?: boolean;
}) {
	return (
		<div className="rounded border border-neutral-200 bg-white px-3 py-2 text-sm">
			<p className="font-mono text-xs text-neutral-500">
				{formatClock(slot.startsAtMs, timezone)}–
				{formatClock(slot.endsAtMs, timezone)}
				{showRoom ? ` · ${slot.roomName}` : ""}
				{showCategory ? ` · ${slot.category}` : ""}
			</p>
			<p className="mt-0.5 font-medium">{slot.title}</p>
			{slot.speakers.length > 0 ? (
				<p className="text-neutral-600">{slot.speakers.join(", ")}</p>
			) : null}
		</div>
	);
}

export default async function PublicSchedulePage({ params, searchParams }: Props) {
	const { eventSlug } = await params;
	const { day: dayParam, view: viewParam, room: roomParam } = await searchParams;

	const db = await getDb();
	const event = await getEventBySlug(db, eventSlug);
	if (!event) notFound();

	const dayKey = parseDayKey(dayParam) ?? DEMO_SCHEDULE_DAY;
	const view = parseView(viewParam);
	const roomFilter = roomParam?.trim() || "all";

	const [rooms, slots] = await Promise.all([
		listEventRooms(db, event.id),
		listAgendaSlotsWithSubmissions(db, event.id),
	]);

	const publicSlots = slots.filter((slot) =>
		isPublicScheduleStatus(slot.submission_status),
	);

	const enriched: EnrichedSlot[] = [];
	for (const slot of publicSlots) {
		const answers = parseAnswers(slot.answers_json);
		const speakers = await listSpeakersForSubmission(db, slot.submission_id);
		enriched.push({
			id: slot.id,
			submissionId: slot.submission_id,
			title: titleFromAnswers(answers),
			roomName: slot.room_name,
			category: displayCategory(slot.category),
			startsAtMs: slot.starts_at,
			endsAtMs: slot.ends_at,
			status: slot.submission_status,
			speakers: speakers.map((speaker) => speaker.name || speaker.email),
			dayKey: dayKeyInTimeZone(slot.starts_at, event.timezone),
		});
	}

	const applyRoom = (list: EnrichedSlot[]) =>
		list.filter(
			(slot) => roomFilter === "all" || slot.roomName === roomFilter,
		);

	const daySlots = applyRoom(
		enriched
			.filter((slot) => slot.dayKey === dayKey)
			.sort(
				(a, b) =>
					a.startsAtMs - b.startsAtMs || a.roomName.localeCompare(b.roomName),
			),
	);

	const weekKeys = weekDayKeys(dayKey);
	const weekSlots = applyRoom(
		enriched
			.filter((slot) => weekKeys.includes(slot.dayKey))
			.sort((a, b) => a.startsAtMs - b.startsAtMs),
	);

	const roomNames = rooms.map((room) => room.name);
	const roomsForDay =
		roomNames.length > 0
			? roomNames
			: [...new Set(daySlots.map((slot) => slot.roomName))];

	const trackLabels = [
		...AIE_CATEGORY_LABELS,
		...[
			...new Set(
				enriched
					.map((slot) => slot.category)
					.filter(
						(label) =>
							!(AIE_CATEGORY_LABELS as readonly string[]).includes(label) &&
							label !== UNCATEGORIZED_CATEGORY,
					),
			),
		],
		UNCATEGORIZED_CATEGORY,
	];

	const trackSlots = applyRoom(
		enriched
			.filter((slot) => slot.dayKey === dayKey)
			.sort((a, b) => a.startsAtMs - b.startsAtMs),
	);

	const views: ScheduleView[] = ["list", "day", "week", "track", "room"];

	return (
		<main className="mx-auto min-h-screen max-w-5xl px-4 py-10 text-neutral-900">
			<header className="mb-8 space-y-3 border-b border-neutral-200 pb-5">
				<p className="text-xs uppercase tracking-wide text-neutral-500">
					Public schedule
				</p>
				<h1 className="text-3xl font-semibold tracking-tight">{event.name}</h1>
				<p className="text-sm text-neutral-600">
					{view === "week"
						? `${formatDayLabel(weekKeys[0]!, event.timezone)} – ${formatDayLabel(weekKeys[6]!, event.timezone)}`
						: formatDayLabel(dayKey, event.timezone)}{" "}
					· {event.timezone}. Shows sessions in{" "}
					<code className="text-xs">scheduled</code> or{" "}
					<code className="text-xs">published</code> status.
				</p>
				<div className="flex flex-wrap gap-3 text-sm">
					{views.map((v) => (
						<Link
							key={v}
							className={view === v ? "font-medium underline" : "underline"}
							href={hrefFor(event.slug, { day: dayKey, view: v, room: roomFilter })}
						>
							{viewLabel(v)}
						</Link>
					))}
					<span className="text-neutral-400">·</span>
					{["all", ...roomsForDay].map((room) => (
						<Link
							key={room}
							className={
								roomFilter === room ? "font-medium underline" : "underline"
							}
							href={hrefFor(event.slug, {
								day: dayKey,
								view,
								room,
							})}
						>
							{room === "all" ? "All rooms" : room}
						</Link>
					))}
				</div>
			</header>

			{view === "list" ? (
				daySlots.length === 0 ? (
					<p className="text-sm text-neutral-600">
						Nothing scheduled for this day yet.
					</p>
				) : (
					<ol className="space-y-4">
						{daySlots.map((slot) => (
							<li
								key={slot.id}
								className="border-l-2 border-neutral-900 pl-4"
							>
								<p className="font-mono text-xs text-neutral-500">
									{formatClock(slot.startsAtMs, event.timezone)}–
									{formatClock(slot.endsAtMs, event.timezone)} · {slot.roomName} ·{" "}
									{slot.category}
								</p>
								<h2 className="mt-1 text-lg font-medium tracking-tight">
									{slot.title}
								</h2>
								{slot.speakers.length > 0 ? (
									<p className="mt-1 text-sm text-neutral-600">
										{slot.speakers.join(", ")}
									</p>
								) : null}
							</li>
						))}
					</ol>
				)
			) : null}

			{view === "day" ? (
				daySlots.length === 0 ? (
					<p className="text-sm text-neutral-600">
						Nothing scheduled for this day yet.
					</p>
				) : (
					<div className="space-y-6">
						{roomsForDay
							.filter((room) => roomFilter === "all" || room === roomFilter)
							.map((room) => {
								const roomSlots = daySlots.filter(
									(slot) => slot.roomName === room,
								);
								if (roomSlots.length === 0) return null;
								return (
									<section key={room}>
										<h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-neutral-500">
											{room}
										</h2>
										<ul className="space-y-3">
											{roomSlots.map((slot) => (
												<li key={slot.id} className="flex gap-4 text-sm">
													<p className="w-28 shrink-0 font-mono text-neutral-500">
														{formatClock(slot.startsAtMs, event.timezone)}–
														{formatClock(slot.endsAtMs, event.timezone)}
													</p>
													<div>
														<p className="font-medium">{slot.title}</p>
														<p className="text-xs text-neutral-500">
															{slot.category}
														</p>
														{slot.speakers.length > 0 ? (
															<p className="text-neutral-600">
																{slot.speakers.join(", ")}
															</p>
														) : null}
													</div>
												</li>
											))}
										</ul>
									</section>
								);
							})}
					</div>
				)
			) : null}

			{view === "week" ? (
				<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-7">
					{weekKeys.map((key) => {
						const column = weekSlots
							.filter((slot) => slot.dayKey === key)
							.sort((a, b) => a.startsAtMs - b.startsAtMs);
						return (
							<section
								key={key}
								className="min-h-[8rem] rounded border border-neutral-200 bg-neutral-50 p-2"
							>
								<h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-neutral-500">
									{formatDayLabel(key, event.timezone)}
								</h2>
								{column.length === 0 ? (
									<p className="text-xs text-neutral-400">No sessions</p>
								) : (
									<ul className="space-y-2">
										{column.map((slot) => (
											<li key={slot.id}>
												<SlotCard
													slot={slot}
													timezone={event.timezone}
													showRoom
													showCategory
												/>
											</li>
										))}
									</ul>
								)}
							</section>
						);
					})}
				</div>
			) : null}

			{view === "track" ? (
				<div className="space-y-6">
					{trackLabels.map((label) => {
						const column = trackSlots.filter((slot) => slot.category === label);
						return (
							<section key={label}>
								<h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-neutral-500">
									{label}{" "}
									<span className="font-normal normal-case text-neutral-400">
										({column.length})
									</span>
								</h2>
								{column.length === 0 ? (
									<p className="text-xs text-neutral-400">No sessions</p>
								) : (
									<ul className="space-y-2">
										{column.map((slot) => (
											<li key={slot.id}>
												<SlotCard
													slot={slot}
													timezone={event.timezone}
													showRoom
												/>
											</li>
										))}
									</ul>
								)}
							</section>
						);
					})}
				</div>
			) : null}

			{view === "room" ? (
				<div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
					{(roomFilter === "all"
						? roomsForDay
						: roomsForDay.filter((room) => room === roomFilter)
					).map((room) => {
						const column = daySlots
							.filter((slot) => slot.roomName === room)
							.sort((a, b) => a.startsAtMs - b.startsAtMs);
						return (
							<section
								key={room}
								className="min-h-[8rem] rounded border border-neutral-200 bg-neutral-50 p-3"
							>
								<h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-neutral-500">
									{room}
								</h2>
								{column.length === 0 ? (
									<p className="text-xs text-neutral-400">No sessions</p>
								) : (
									<ul className="space-y-2">
										{column.map((slot) => (
											<li key={slot.id}>
												<SlotCard
													slot={slot}
													timezone={event.timezone}
													showCategory
												/>
											</li>
										))}
									</ul>
								)}
							</section>
						);
					})}
					{roomsForDay.length === 0 ? (
						<p className="text-sm text-neutral-600">No rooms configured.</p>
					) : null}
				</div>
			) : null}

			<p className="mt-10 text-xs text-neutral-500">
				<Link className="underline" href={`/e/${event.slug}/submit/cfp`}>
					CFP
				</Link>
			</p>
		</main>
	);
}
