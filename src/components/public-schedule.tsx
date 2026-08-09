import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb } from "@/lib/db/cloudflare";
import {
	getEventBySlug,
	listAgendaTracks,
	listAgendaSlotsWithSubmissions,
	listEventRooms,
	listSpeakersForSubmissions,
} from "@/lib/db/queries";
import { displayCategory, isPublicScheduleStatus, titleFromAnswers } from "@/lib/domain";
import {
	publicScheduleTrack,
	publicScheduleTrackColumns,
	type PublicScheduleTrack,
} from "@/lib/schedule/public-tracks";
import {
	SEGMENTED_CONTAINER_CLASSES,
	EmptyState,
} from "@/components/ui";
import { PublicSpeakerAvatar } from "@/components/public-speaker-avatar";
import { PublicSessionsDiscover } from "@/components/public-sessions-discover";
import {
	deriveScheduleDays,
	dayKeyInTimeZone,
	formatClock,
	formatDayLabel,
	parseDayKey,
	weekDayKeys,
} from "@/lib/schedule/time";

export type ScheduleView = "list" | "day" | "week" | "track" | "room";

export type PublicScheduleBasePath = "/e" | "/embed";

export type PublicScheduleProps = {
	params: Promise<{ eventSlug: string }>;
	searchParams: Promise<{ day?: string; view?: string; room?: string }>;
	basePath: PublicScheduleBasePath;
};

type PublicScheduleSpeaker = {
	personId: string | null;
	name: string;
	jobTitle: string | null;
	company: string | null;
	hasHeadshot: boolean;
};

type EnrichedSlot = {
	id: string;
	submissionId: string;
	title: string;
	abstract: string;
	format: string;
	roomName: string;
	track: PublicScheduleTrack;
	startsAtMs: number;
	endsAtMs: number;
	status: string;
	speakers: PublicScheduleSpeaker[];
	dayKey: string;
	detailHref: string;
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
	basePath: PublicScheduleBasePath,
	eventSlug: string,
	args: { day: string; view: ScheduleView; room: string },
): string {
	const params = new URLSearchParams();
	params.set("day", args.day);
	params.set("view", args.view);
	if (args.room !== "all") params.set("room", args.room);
	return `${basePath}/${eventSlug}/schedule?${params.toString()}`;
}

function SpeakerLine({
	speakers,
	eventSlug,
	basePath,
}: {
	speakers: PublicScheduleSpeaker[];
	eventSlug: string;
	basePath: PublicScheduleBasePath;
}) {
	if (speakers.length === 0) return null;
	return (
		<ul className="mt-1 flex flex-wrap gap-3">
			{speakers.map((speaker, index) => (
				<li key={`${speaker.personId ?? speaker.name}-${index}`}>
					<PublicSpeakerAvatar
						eventSlug={eventSlug}
						personId={speaker.personId}
						name={speaker.name}
						hasHeadshot={speaker.hasHeadshot}
						size="sm"
						profileHref={
							basePath === "/e" && speaker.personId
								? `/e/${eventSlug}/speakers/${speaker.personId}`
								: null
						}
					/>
					{speaker.jobTitle || speaker.company ? (
						<p className="mt-0.5 text-xs text-neutral-500">
							{[speaker.jobTitle, speaker.company].filter(Boolean).join(" · ")}
						</p>
					) : null}
				</li>
			))}
		</ul>
	);
}

function SlotCard({
	slot,
	timezone,
	eventSlug,
	basePath,
	showRoom,
	showTrack,
}: {
	slot: EnrichedSlot;
	timezone: string;
	eventSlug: string;
	basePath: PublicScheduleBasePath;
	showRoom?: boolean;
	showTrack?: boolean;
}) {
	return (
		<div className="rounded-md border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm">
			<p className="font-mono text-xs tabular-nums text-neutral-500">
				{formatClock(slot.startsAtMs, timezone)}–
				{formatClock(slot.endsAtMs, timezone)}
				{showRoom ? ` · ${slot.roomName}` : ""}
				{showTrack ? ` · ${slot.track.name}` : ""}
			</p>
			<Link className="mt-0.5 block font-medium text-neutral-100 hover:underline" href={slot.detailHref}>{slot.title}</Link>
			<SpeakerLine speakers={slot.speakers} eventSlug={eventSlug} basePath={basePath} />
		</div>
	);
}

export async function PublicSchedule({
	params,
	searchParams,
	basePath,
}: PublicScheduleProps) {
	const { eventSlug } = await params;
	const { day: dayParam, view: viewParam, room: roomParam } = await searchParams;

	const db = await getDb();
	const event = await getEventBySlug(db, eventSlug);
	if (!event) notFound();

	const [rooms, slots, tracks] = await Promise.all([
		listEventRooms(db, event.id),
		listAgendaSlotsWithSubmissions(db, event.id),
		listAgendaTracks(db, event.id, { includeRetired: true }),
	]);
	const days = deriveScheduleDays({
		startDay: event.start_day,
		endDay: event.end_day,
		scheduledDays: slots.map((slot) => dayKeyInTimeZone(slot.starts_at, event.timezone)),
		timeZone: event.timezone,
	});
	const requestedDay = parseDayKey(dayParam);
	const dayKey = requestedDay && days.includes(requestedDay) ? requestedDay : days[0]!;
	const view = parseView(viewParam);
	const roomFilter = roomParam?.trim() || "all";

	const publicSlots = slots.filter((slot) =>
		isPublicScheduleStatus(slot.submission_status),
	);

	const enriched: EnrichedSlot[] = [];
	const speakersBySubmission = await listSpeakersForSubmissions(db, publicSlots.map((slot) => slot.submission_id));
	const personIds = [
		...new Set(
			[...speakersBySubmission.values()]
				.flat()
				.filter((speaker) => speaker.status === "confirmed" && speaker.person_id)
				.map((speaker) => speaker.person_id!),
		),
	];
	const profileByPerson = new Map<string, { hasHeadshot: boolean; jobTitle: string | null; company: string | null }>();
	if (personIds.length > 0) {
		const placeholders = personIds.map(() => "?").join(", ");
		const profiles = await db
			.prepare(
				`SELECT person_id, headshot_asset_id, job_title, company
         FROM speaker_profiles
         WHERE event_id = ? AND person_id IN (${placeholders})`,
			)
			.bind(event.id, ...personIds)
			.all<{ person_id: string; headshot_asset_id: string | null; job_title: string | null; company: string | null }>();
		for (const profile of profiles.results) {
			profileByPerson.set(profile.person_id, {
				hasHeadshot: Boolean(profile.headshot_asset_id),
				jobTitle: profile.job_title,
				company: profile.company,
			});
		}
	}
	for (const slot of publicSlots) {
		const answers = parseAnswers(slot.answers_json);
		const speakers = speakersBySubmission.get(slot.submission_id) ?? [];
		const abstract =
			typeof answers.abstract === "string"
				? answers.abstract.trim()
				: typeof answers.description === "string"
					? answers.description.trim()
					: "";
		enriched.push({
			id: slot.id,
			submissionId: slot.submission_id,
			title: titleFromAnswers(answers),
			abstract,
			format: displayCategory(slot.category),
			roomName: slot.room_name,
			track: publicScheduleTrack(slot.track_id, tracks),
			startsAtMs: slot.starts_at,
			endsAtMs: slot.ends_at,
			status: slot.submission_status,
			speakers: speakers
				.filter((speaker) => speaker.status === "confirmed")
				.map((speaker) => {
					const profile = speaker.person_id ? profileByPerson.get(speaker.person_id) : undefined;
					return {
						personId: speaker.person_id,
						name: speaker.name.trim() || "Speaker",
						jobTitle: profile?.jobTitle ?? null,
						company: profile?.company ?? null,
						hasHeadshot: profile?.hasHeadshot ?? false,
					};
				}),
			dayKey: dayKeyInTimeZone(slot.starts_at, event.timezone),
			detailHref: `${basePath}/${event.slug}/sessions/${slot.submission_id}`,
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

	const trackColumns = publicScheduleTrackColumns(
		tracks,
		enriched.map((slot) => slot.track),
	);

	const trackSlots = applyRoom(
		enriched
			.filter((slot) => slot.dayKey === dayKey)
			.sort((a, b) => a.startsAtMs - b.startsAtMs),
	);

	const views: ScheduleView[] = ["list", "day", "week", "track", "room"];

	return (
		<main className="mx-auto max-w-5xl px-4 py-10">
			<header className="mb-8 space-y-4 border-b border-neutral-800 pb-5">
				<div className="space-y-2">
					<p className="text-xs font-medium uppercase tracking-wide text-neutral-500">
						Public schedule
					</p>
					<h1 className="text-balance text-3xl font-semibold tracking-tight text-neutral-100">
						{event.name}
					</h1>
					<p className="text-pretty text-sm text-neutral-400">
						{view === "week"
							? `${formatDayLabel(weekKeys[0]!, event.timezone)} – ${formatDayLabel(weekKeys[6]!, event.timezone)}`
							: formatDayLabel(dayKey, event.timezone)}{" "}
						· {event.timezone}
					</p>
				</div>

				<div className="flex flex-col gap-3">
					<div
						role="tablist"
						aria-label="Schedule view"
						className={SEGMENTED_CONTAINER_CLASSES}
					>
						{views.map((v) => {
							const active = view === v;
							return (
								<Link
									key={v}
									role="tab"
									aria-selected={active}
									href={hrefFor(basePath, event.slug, {
										day: dayKey,
										view: v,
										room: roomFilter,
									})}
									className={
										active
											? "rounded-md bg-neutral-800 px-3 py-1.5 text-sm font-medium text-neutral-100"
											: "rounded-md px-3 py-1.5 text-sm font-medium text-neutral-400 hover:text-neutral-100"
									}
								>
									{viewLabel(v)}
								</Link>
							);
						})}
					</div>

					<div className="flex flex-wrap items-center gap-1.5">
						<span className="mr-1 text-xs font-medium uppercase tracking-wide text-neutral-500">
							Room
						</span>
						{["all", ...roomsForDay].map((room) => {
							const active = roomFilter === room;
							return (
								<Link
									key={room}
									href={hrefFor(basePath, event.slug, {
										day: dayKey,
										view,
										room,
									})}
									className={
										active
											? "rounded-full bg-neutral-800 px-2.5 py-1 text-xs font-medium text-neutral-100"
											: "rounded-full border border-neutral-700 bg-neutral-900 px-2.5 py-1 text-xs font-medium text-neutral-300 hover:border-neutral-500"
									}
								>
									{room === "all" ? "All rooms" : room}
								</Link>
							);
						})}
					</div>
				</div>
			</header>

			{view === "list" ? (
				enriched.length === 0 ? (
					<EmptyState
						title="Nothing scheduled yet"
						description="Check back once organizers publish the program, or try another view."
					/>
				) : (
					<PublicSessionsDiscover
						sessions={enriched.map((slot) => ({
							id: slot.id,
							title: slot.title,
							abstract: slot.abstract,
							trackId: slot.track.id,
							trackName: slot.track.name,
							format: slot.format,
							location: slot.roomName,
							speakerNames: slot.speakers.map((speaker) => speaker.name),
							startsAtMs: slot.startsAtMs,
							endsAtMs: slot.endsAtMs,
							dayKey: slot.dayKey,
							detailHref: slot.detailHref,
							speakers: slot.speakers,
						}))}
						timezone={event.timezone}
						eventSlug={event.slug}
						basePath={basePath}
						initialDayKey={dayKey}
					/>
				)
			) : null}

			{view === "day" ? (
				daySlots.length === 0 ? (
					<EmptyState
						title="Nothing scheduled for this day"
						description="Try another room filter or come back after scheduling."
					/>
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
													<p className="w-28 shrink-0 font-mono tabular-nums text-neutral-500">
														{formatClock(slot.startsAtMs, event.timezone)}–
														{formatClock(slot.endsAtMs, event.timezone)}
													</p>
													<div>
														<Link className="font-medium text-neutral-100 hover:underline" href={slot.detailHref}>{slot.title}</Link>
														<p className="text-xs text-neutral-500">
															{slot.track.name}
														</p>
														<SpeakerLine speakers={slot.speakers} eventSlug={event.slug} basePath={basePath} />
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
								className="min-h-[8rem] rounded-lg border border-neutral-800 bg-neutral-900 p-2"
							>
								<h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-neutral-500">
									{formatDayLabel(key, event.timezone)}
								</h2>
								{column.length === 0 ? (
									<p className="text-xs text-neutral-500">No sessions</p>
								) : (
									<ul className="space-y-2">
										{column.map((slot) => (
											<li key={slot.id}>
												<SlotCard
													slot={slot}
													timezone={event.timezone}
													eventSlug={event.slug}
													basePath={basePath}
													showRoom
													showTrack
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
					{trackColumns.map((track) => {
						const column = trackSlots.filter((slot) => slot.track.id === track.id);
						return (
							<section key={track.id ?? "unassigned"}>
								<h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-neutral-500">
									{track.name}{" "}
									<span className="font-normal normal-case text-neutral-500">
										({column.length})
									</span>
								</h2>
								{column.length === 0 ? (
									<p className="text-xs text-neutral-500">No sessions</p>
								) : (
									<ul className="space-y-2">
										{column.map((slot) => (
											<li key={slot.id}>
												<SlotCard
													slot={slot}
													timezone={event.timezone}
													eventSlug={event.slug}
													basePath={basePath}
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
								className="min-h-[8rem] rounded-lg border border-neutral-800 bg-neutral-900 p-3"
							>
								<h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-neutral-500">
									{room}
								</h2>
								{column.length === 0 ? (
									<p className="text-xs text-neutral-500">No sessions</p>
								) : (
									<ul className="space-y-2">
										{column.map((slot) => (
											<li key={slot.id}>
												<SlotCard
													slot={slot}
													timezone={event.timezone}
													eventSlug={event.slug}
													basePath={basePath}
													showTrack
												/>
											</li>
										))}
									</ul>
								)}
							</section>
						);
					})}
					{roomsForDay.length === 0 ? (
						<div className="md:col-span-2 lg:col-span-3">
							<EmptyState
								title="No rooms configured"
								description="Organizers haven't set up rooms for this day yet."
							/>
						</div>
					) : null}
				</div>
			) : null}

			<p className="mt-10 flex flex-wrap gap-4 text-sm text-neutral-500">
				{basePath === "/e" ? (
					<Link
						className="font-medium text-neutral-200 underline underline-offset-2"
						href={`/e/${event.slug}/speakers`}
					>
						Speakers
					</Link>
				) : null}
				<Link
					className="font-medium text-neutral-200 underline underline-offset-2"
					href={`/e/${event.slug}/submit/cfp`}
				>
					Submit a talk
				</Link>
			</p>
		</main>
	);
}
