import { notFound, redirect } from "next/navigation";
import { AdminEventNav } from "@/components/admin-event-nav";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/ui";
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
		<div className="min-h-dvh bg-neutral-950 text-neutral-200">
			<AdminEventNav eventSlug={event.slug} />
			<main className="mx-auto max-w-6xl px-4 py-10">
				<PageHeader
					eyebrow="Organizer · Schedule"
					title={event.name}
					description="Drag accepted talks onto room/time slots. Room and speaker overlaps are blocked and shown loudly."
				/>

				{sessions.length === 0 ? (
					<EmptyState
						title="Nothing to schedule yet"
						description="Accept a submission first, then come back to place it on the grid."
					/>
				) : (
					<ScheduleBoard
						eventSlug={event.slug}
						timeZone={event.timezone}
						dayKey={dayKey}
						rooms={roomNames}
						sessions={sessions}
					/>
				)}
			</main>
		</div>
	);
}
