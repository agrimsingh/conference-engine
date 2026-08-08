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
	isPublicScheduleStatus,
	titleFromAnswers,
} from "@/lib/domain";
import {
	DEMO_SCHEDULE_DAY,
	dayKeyInTimeZone,
	formatClock,
	formatDayLabel,
	parseDayKey,
} from "@/lib/schedule/time";

type Props = {
	params: Promise<{ eventSlug: string }>;
	searchParams: Promise<{ day?: string; view?: string; room?: string }>;
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

export default async function PublicSchedulePage({ params, searchParams }: Props) {
	const { eventSlug } = await params;
	const { day: dayParam, view: viewParam, room: roomParam } = await searchParams;

	const db = await getDb();
	const event = await getEventBySlug(db, eventSlug);
	if (!event) notFound();

	const dayKey = parseDayKey(dayParam) ?? DEMO_SCHEDULE_DAY;
	const view = viewParam === "day" ? "day" : "list";
	const roomFilter = roomParam?.trim() || "all";

	const [rooms, slots] = await Promise.all([
		listEventRooms(db, event.id),
		listAgendaSlotsWithSubmissions(db, event.id),
	]);

	const publicSlots = slots.filter((slot) =>
		isPublicScheduleStatus(slot.submission_status),
	);

	const enriched: Array<{
		id: string;
		submissionId: string;
		title: string;
		roomName: string;
		startsAtMs: number;
		endsAtMs: number;
		status: string;
		speakers: string[];
		dayKey: string;
	}> = [];
	for (const slot of publicSlots) {
		const answers = parseAnswers(slot.answers_json);
		const speakers = await listSpeakersForSubmission(db, slot.submission_id);
		enriched.push({
			id: slot.id,
			submissionId: slot.submission_id,
			title: titleFromAnswers(answers),
			roomName: slot.room_name,
			startsAtMs: slot.starts_at,
			endsAtMs: slot.ends_at,
			status: slot.submission_status,
			speakers: speakers.map((speaker) => speaker.name || speaker.email),
			dayKey: dayKeyInTimeZone(slot.starts_at, event.timezone),
		});
	}

	const daySlots = enriched
		.filter((slot) => slot.dayKey === dayKey)
		.filter((slot) => roomFilter === "all" || slot.roomName === roomFilter)
		.sort((a, b) => a.startsAtMs - b.startsAtMs || a.roomName.localeCompare(b.roomName));

	const roomNames = rooms.map((room) => room.name);
	const roomsForDay =
		roomNames.length > 0
			? roomNames
			: [...new Set(daySlots.map((slot) => slot.roomName))];

	return (
		<main className="mx-auto min-h-screen max-w-4xl px-4 py-10 text-neutral-900">
			<header className="mb-8 space-y-3 border-b border-neutral-200 pb-5">
				<p className="text-xs uppercase tracking-wide text-neutral-500">
					Public schedule
				</p>
				<h1 className="text-3xl font-semibold tracking-tight">{event.name}</h1>
				<p className="text-sm text-neutral-600">
					{formatDayLabel(dayKey, event.timezone)} · {event.timezone}. Shows
					sessions in <code className="text-xs">scheduled</code> or{" "}
					<code className="text-xs">published</code> status.
				</p>
				<div className="flex flex-wrap gap-3 text-sm">
					<Link
						className={view === "list" ? "font-medium underline" : "underline"}
						href={`/e/${event.slug}/schedule?day=${dayKey}&view=list${roomFilter !== "all" ? `&room=${encodeURIComponent(roomFilter)}` : ""}`}
					>
						List
					</Link>
					<Link
						className={view === "day" ? "font-medium underline" : "underline"}
						href={`/e/${event.slug}/schedule?day=${dayKey}&view=day${roomFilter !== "all" ? `&room=${encodeURIComponent(roomFilter)}` : ""}`}
					>
						Day
					</Link>
					<span className="text-neutral-400">·</span>
					{["all", ...roomsForDay].map((room) => (
						<Link
							key={room}
							className={
								roomFilter === room ? "font-medium underline" : "underline"
							}
							href={`/e/${event.slug}/schedule?day=${dayKey}&view=${view}${room === "all" ? "" : `&room=${encodeURIComponent(room)}`}`}
						>
							{room === "all" ? "All rooms" : room}
						</Link>
					))}
				</div>
			</header>

			{daySlots.length === 0 ? (
				<p className="text-sm text-neutral-600">
					Nothing scheduled for this day yet.
				</p>
			) : view === "list" ? (
				<ol className="space-y-4">
					{daySlots.map((slot) => (
						<li
							key={slot.id}
							className="border-l-2 border-neutral-900 pl-4"
						>
							<p className="font-mono text-xs text-neutral-500">
								{formatClock(slot.startsAtMs, event.timezone)}–
								{formatClock(slot.endsAtMs, event.timezone)} · {slot.roomName}
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
			) : (
				<div className="space-y-6">
					{roomsForDay
						.filter((room) => roomFilter === "all" || room === roomFilter)
						.map((room) => {
							const roomSlots = daySlots.filter((slot) => slot.roomName === room);
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
			)}

			<p className="mt-10 text-xs text-neutral-500">
				<Link className="underline" href={`/e/${event.slug}/submit/cfp`}>
					CFP
				</Link>
			</p>
		</main>
	);
}
