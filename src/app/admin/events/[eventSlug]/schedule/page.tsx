import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { isAdminBypass } from "@/lib/auth/admin";
import { getDb } from "@/lib/db/cloudflare";
import {
	getEventBySlug,
	listAgendaSlotsForEvent,
	listEventRooms,
	listSchedulableSubmissions,
	listSpeakersForSubmission,
} from "@/lib/db/queries";
import {
	durationMinutesFromAnswers,
	normalizeSpeakerKey,
	titleFromAnswers,
} from "@/lib/domain";
import {
	DEMO_SCHEDULE_DAY,
	parseDayKey,
} from "@/lib/schedule/time";
import {
	ScheduleBoard,
	type ScheduleSession,
} from "./schedule-board";

type Props = {
	params: Promise<{ eventSlug: string }>;
	searchParams: Promise<{ day?: string }>;
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

export default async function AdminSchedulePage({ params, searchParams }: Props) {
	const { eventSlug } = await params;
	const { day: dayParam } = await searchParams;

	if (!(await isAdminBypass())) {
		redirect(`/admin/bypass?next=/admin/events/${eventSlug}/schedule`);
	}

	const db = await getDb();
	const event = await getEventBySlug(db, eventSlug);
	if (!event) notFound();

	const dayKey = parseDayKey(dayParam) ?? DEMO_SCHEDULE_DAY;
	const [rooms, submissions, slots] = await Promise.all([
		listEventRooms(db, event.id),
		listSchedulableSubmissions(db, event.id),
		listAgendaSlotsForEvent(db, event.id),
	]);

	const slotsBySubmission = new Map(
		slots.map((slot) => [slot.submission_id, slot] as const),
	);

	const sessions: ScheduleSession[] = [];
	for (const row of submissions) {
		const answers = parseAnswers(row.answers_json);
		const speakers = await listSpeakersForSubmission(db, row.id);
		const slot = slotsBySubmission.get(row.id) ?? null;
		sessions.push({
			id: row.id,
			title: titleFromAnswers(answers),
			status: row.status,
			submitterName: row.submitter_name,
			durationMinutes: durationMinutesFromAnswers(answers),
			speakerKeys: speakers.map((speaker) =>
				normalizeSpeakerKey(speaker.email),
			),
			speakerLabels: speakers.map((speaker) => speaker.name || speaker.email),
			slot: slot
				? {
						roomName: slot.room_name,
						startsAtMs: slot.starts_at,
						endsAtMs: slot.ends_at,
					}
				: null,
		});
	}

	const roomNames =
		rooms.length > 0
			? rooms.map((room) => room.name)
			: ["Main Stage", "Room B", "Workshop Lab"];

	return (
		<main className="mx-auto min-h-screen max-w-6xl px-4 py-10 text-neutral-900">
			<header className="mb-8 space-y-2 border-b border-neutral-200 pb-4">
				<p className="text-xs uppercase tracking-wide text-neutral-500">
					Organizer · schedule
				</p>
				<h1 className="text-3xl font-semibold tracking-tight">{event.name}</h1>
				<p className="text-sm text-neutral-600">
					Drag accepted talks onto the day grid. Hard conflicts (same room or
					same speaker overlap) are blocked server-side.
				</p>
				<p className="text-sm">
					<Link className="underline" href={`/admin/events/${event.slug}/submissions`}>
						Submissions
					</Link>
					{" · "}
					<Link className="underline" href={`/e/${event.slug}/schedule`}>
						Public schedule
					</Link>
					{" · "}
					<Link
						className="underline"
						href={`/admin/events/${event.slug}/schedule?day=${dayKey}`}
					>
						Day {dayKey}
					</Link>
				</p>
			</header>

			<ScheduleBoard
				eventSlug={event.slug}
				timeZone={event.timezone}
				dayKey={dayKey}
				rooms={roomNames}
				sessions={sessions}
			/>
		</main>
	);
}
