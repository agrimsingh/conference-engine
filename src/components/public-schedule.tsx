import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb } from "@/lib/db/cloudflare";
import {
	getEventBySlug,
	listAgendaTracks,
	listAgendaSlotsWithSubmissions,
	listEventRooms,
	listSpeakerProfileCardsForPeople,
	listSpeakersForSubmissions,
} from "@/lib/db/queries";
import { getPublicEmbedBySlug } from "@/lib/embeds/embed";
import { isPublicScheduleStatus, titleFromAnswers } from "@/lib/domain";
import { filterPublicEmbedSessions, publicSessionFormat } from "@/lib/schedule/public-format";
import {
	publicScheduleTrack,
	publicScheduleTrackColumns,
	type PublicScheduleTrack,
} from "@/lib/schedule/public-tracks";
import { EmptyState } from "@/components/ui";
import { PublicSpeakerAvatar } from "@/components/public-speaker-avatar";
import { PublicItinerary } from "@/components/public-itinerary";
import { ScheduleQuerySelect } from "@/components/schedule-query-select";
import {
	defaultScheduleDayKey,
	deriveScheduleDays,
	dayKeyInTimeZone,
	formatClock,
	formatDayChip,
	formatDayLabel,
	parseDayKey,
	weekDayKeys,
} from "@/lib/schedule/time";
import { speakerRoleLine } from "@/lib/speakers/public-directory";

export type ScheduleView = "itinerary" | "my-schedule" | "day" | "week" | "track" | "room";

export type PublicScheduleBasePath = "/e" | "/embed";

export type PublicScheduleProps = {
	params: Promise<{ eventSlug: string }>;
	searchParams: Promise<{ day?: string; view?: string; room?: string; embed?: string }>;
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
	room: string;
	roomName: string;
	trackId: string | null;
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
		case "itinerary":
		case "my-schedule":
		case "day":
		case "week":
		case "track":
		case "room":
			return value;
		case "list":
			return "itinerary";
		default:
			return "itinerary";
	}
}

function viewLabel(view: ScheduleView): string {
	switch (view) {
		case "itinerary":
			return "Itinerary";
		case "my-schedule":
			return "My Schedule";
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
	args: { day: string; view: ScheduleView; room: string; embed?: string },
): string {
	const params = new URLSearchParams();
	params.set("day", args.day);
	params.set("view", args.view);
	if (args.room !== "all") params.set("room", args.room);
	if (args.embed) params.set("embed", args.embed);
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
			{speakers.map((speaker, index) => {
				const role = speakerRoleLine(speaker);
				return (
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
						{role ? <p className="mt-0.5 text-xs text-neutral-500">{role}</p> : null}
					</li>
				);
			})}
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
	const { day: dayParam, view: viewParam, room: roomParam, embed: embedParam } = await searchParams;

	const db = await getDb();
	const event = await getEventBySlug(db, eventSlug);
	if (!event) notFound();
	const requestedView = parseView(viewParam);
	const requiresItineraryEmbed = basePath === "/e"
		&& (requestedView === "itinerary" || requestedView === "my-schedule")
		&& embedParam !== undefined;
	const itineraryEmbed = requiresItineraryEmbed
		? await getPublicEmbedBySlug(db, event.id, embedParam.trim())
		: null;
	if (requiresItineraryEmbed && !itineraryEmbed) notFound();

	const [rooms, slots, tracks] = await Promise.all([
		listEventRooms(db, event.id),
		listAgendaSlotsWithSubmissions(db, event.id),
		listAgendaTracks(db, event.id, { includeRetired: true }),
	]);
	const scheduledDayKeys = new Set(
		slots.map((slot) => dayKeyInTimeZone(slot.starts_at, event.timezone)),
	);
	const days = deriveScheduleDays({
		startDay: event.start_day,
		endDay: event.end_day,
		scheduledDays: [...scheduledDayKeys],
		timeZone: event.timezone,
	});
	// eslint-disable-next-line react-hooks/purity -- request-time default day in a server component
	const todayKey = dayKeyInTimeZone(Date.now(), event.timezone);
	const view = basePath === "/embed" && requestedView === "my-schedule"
		? "itinerary"
		: requestedView;
	const allDaysSelected = (view === "itinerary" || view === "my-schedule") && dayParam?.trim() === "all";
	const requestedDay = parseDayKey(dayParam);
	const dayKey = requestedDay && days.includes(requestedDay)
		? requestedDay
		: defaultScheduleDayKey(days, scheduledDayKeys, todayKey);
	/** URL day for itinerary browse: concrete key or `"all"`. Grid views always use a concrete day. */
	const dayQuery = allDaysSelected ? "all" : dayKey;
	const roomFilter = roomParam?.trim() || "all";

	const publicSlots = slots.filter((slot) =>
		isPublicScheduleStatus(slot.submission_status) && slot.content_approved === 1,
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
	const profileByPerson = await listSpeakerProfileCardsForPeople(db, event.id, personIds);
	for (const slot of publicSlots) {
		const answers = { ...parseAnswers(slot.answers_json), ...parseAnswers(slot.approved_answers_json ?? "{}") };
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
			format: publicSessionFormat(answers, slot.category),
			room: slot.room_name,
			roomName: slot.room_name,
			trackId: slot.track_id ?? null,
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
	const itinerarySlots = itineraryEmbed
		? filterPublicEmbedSessions(
			enriched,
			itineraryEmbed.config,
		)
		: enriched;

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
			: [
					...new Set(
						(allDaysSelected ? enriched : daySlots).map((slot) => slot.roomName),
					),
				];

	const trackColumns = publicScheduleTrackColumns(
		tracks,
		enriched.map((slot) => slot.track),
	);

	const trackSlots = applyRoom(
		enriched
			.filter((slot) => slot.dayKey === dayKey)
			.sort((a, b) => a.startsAtMs - b.startsAtMs),
	);

	const views: ScheduleView[] = basePath === "/e"
		? ["itinerary", "my-schedule", "day", "week", "track", "room"]
		: ["itinerary", "day", "week", "track", "room"];

	return (
		<main className="mx-auto max-w-5xl px-4 py-10">
			<header className="mb-8 border-b border-neutral-800">
				<div className="space-y-2 pb-5">
					<p className="text-xs font-medium uppercase tracking-wide text-neutral-500">
						Public schedule
					</p>
					<div className="flex flex-wrap items-start justify-between gap-3">
						<h1 className="text-balance text-3xl font-semibold tracking-tight text-neutral-100">
							{event.name}
						</h1>
						<a
							href={`/api/e/${event.slug}/schedule.ics`}
							className="shrink-0 rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-200 hover:border-neutral-500"
						>
							Subscribe to calendar
						</a>
					</div>
					<p className="text-pretty text-sm text-neutral-400">
						{allDaysSelected
							? "All days"
							: view === "week"
								? `${formatDayLabel(weekKeys[0]!, event.timezone)} – ${formatDayLabel(weekKeys[6]!, event.timezone)}`
								: formatDayLabel(dayKey, event.timezone)}{" "}
						· {event.timezone}
					</p>
				</div>

				{/* Mobile: View + Day selects. Desktop keeps the underline tab strip. */}
				<div className="grid grid-cols-2 gap-3 pb-5 sm:hidden">
					<ScheduleQuerySelect
						label="View"
						value={view}
						options={views.map((v) => ({
							value: v,
							label: viewLabel(v),
							href: hrefFor(basePath, event.slug, {
								day:
									(v === "itinerary" || v === "my-schedule") && allDaysSelected
										? "all"
										: dayKey,
								view: v,
								room: roomFilter,
								embed: itineraryEmbed?.slug,
							}),
						}))}
					/>
					<ScheduleQuerySelect
						label="Day"
						value={allDaysSelected ? "all" : dayKey}
						options={[
							...(view === "itinerary" || view === "my-schedule"
								? [
										{
											value: "all",
											label: "All days",
											href: hrefFor(basePath, event.slug, {
												day: "all",
												view,
												room: roomFilter,
												embed: itineraryEmbed?.slug,
											}),
										},
									]
								: []),
							...days.map((key) => ({
								value: key,
								label: formatDayLabel(key, event.timezone),
								href: hrefFor(basePath, event.slug, {
									day: key,
									view,
									room: roomFilter,
									embed: itineraryEmbed?.slug,
								}),
							})),
						]}
					/>
				</div>

				<nav
					role="tablist"
					aria-label="Schedule view"
					className="-mb-px hidden gap-1 sm:flex"
				>
					{views.map((v) => {
						const active = view === v;
						return (
							<Link
								key={v}
								role="tab"
								aria-selected={active}
								href={hrefFor(basePath, event.slug, {
									day:
										(v === "itinerary" || v === "my-schedule") && allDaysSelected
											? "all"
											: dayKey,
									view: v,
									room: roomFilter,
									embed: itineraryEmbed?.slug,
								})}
								className={
									active
										? "shrink-0 border-b-2 border-neutral-100 px-3 py-2.5 text-sm font-medium text-neutral-100"
										: "shrink-0 border-b-2 border-transparent px-3 py-2.5 text-sm font-medium text-neutral-500 hover:border-neutral-700 hover:text-neutral-200"
								}
							>
								{viewLabel(v)}
							</Link>
						);
					})}
				</nav>
			</header>

			<nav
				aria-label="Event days"
				className="mb-6 hidden flex-wrap items-center gap-2 sm:flex"
			>
				<span className="mr-1 text-xs font-medium uppercase tracking-wide text-neutral-500">
					Event days
				</span>
				{view === "itinerary" || view === "my-schedule" ? (
					<Link
						href={hrefFor(basePath, event.slug, {
							day: "all",
							view,
							room: roomFilter,
							embed: itineraryEmbed?.slug,
						})}
						aria-current={allDaysSelected ? "date" : undefined}
						className={
							allDaysSelected
								? "rounded-md bg-neutral-100 px-2.5 py-1.5 text-sm font-medium text-neutral-950"
								: "rounded-md border border-neutral-700 bg-neutral-900 px-2.5 py-1.5 text-sm font-medium text-neutral-300 hover:border-neutral-500"
						}
					>
						All days
					</Link>
				) : null}
				{days.map((key) => (
					<Link
						key={key}
						href={hrefFor(basePath, event.slug, {
							day: key,
							view,
							room: roomFilter,
							embed: itineraryEmbed?.slug,
						})}
						aria-current={!allDaysSelected && key === dayKey ? "date" : undefined}
						title={formatDayLabel(key, event.timezone)}
						className={
							!allDaysSelected && key === dayKey
								? "rounded-md bg-neutral-100 px-2.5 py-1.5 text-sm font-medium tabular-nums text-neutral-950"
								: "rounded-md border border-neutral-700 bg-neutral-900 px-2.5 py-1.5 text-sm font-medium tabular-nums text-neutral-300 hover:border-neutral-500"
						}
					>
						{formatDayChip(key, event.timezone)}
					</Link>
				))}
			</nav>

			{view === "itinerary" || view === "my-schedule" ? (
				itinerarySlots.length === 0 && view === "itinerary" ? (
					<EmptyState
						title="Nothing scheduled yet"
						description="Check back once organizers publish the program, or try another view."
					/>
				) : (
					<PublicItinerary
						eventSlug={event.slug}
						timezone={event.timezone}
						mode={view}
						basePath={basePath}
						selectionEnabled={basePath === "/e"}
						initialDayKey={dayQuery}
						initialRoom={roomFilter}
						eventSessionIds={enriched.map((slot) => slot.submissionId)}
						roomOptions={
							view === "itinerary"
								? ["all", ...roomsForDay].map((room) => ({
										value: room,
										label: room === "all" ? "All rooms" : room,
										href: hrefFor(basePath, event.slug, {
											day: dayQuery,
											view,
											room,
											embed: itineraryEmbed?.slug,
										}),
									}))
								: undefined
						}
						sessions={itinerarySlots.map((slot) => ({
							id: slot.id,
							sessionId: slot.submissionId,
							title: slot.title,
							abstract: slot.abstract,
							format: slot.format,
							roomName: slot.roomName,
							trackId: slot.track.id,
							trackName: slot.track.name,
							startsAtMs: slot.startsAtMs,
							endsAtMs: slot.endsAtMs,
							dayKey: slot.dayKey,
							detailHref: slot.detailHref,
							speakers: slot.speakers,
						}))}
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
				{event.mode === "demo" ? (
					<Link
						className="font-medium text-neutral-200 underline underline-offset-2"
						href="/demo?perspective=applicant"
					>
						Try the demo CFP
					</Link>
				) : (
					<Link
						className="font-medium text-neutral-200 underline underline-offset-2"
						href={`/e/${event.slug}/submit/cfp`}
					>
						Submit a talk
					</Link>
				)}
			</p>
		</main>
	);
}
