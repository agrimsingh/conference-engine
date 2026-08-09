import { AdminEventNav } from "@/components/admin-event-nav";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/ui";
import { assertCanManageEvent } from "@/lib/auth/admin";
import { getDb } from "@/lib/db/cloudflare";
import {
	listAgendaSlotsForEvent,
	listAgendaTracks,
	listEventRooms,
	listSchedulableSubmissions,
	listSpeakersForSubmissions,
} from "@/lib/db/queries";
import {
	durationMinutesFromAnswers,
	displayCategory,
	normalizeSpeakerKey,
	titleFromAnswers,
} from "@/lib/domain";
import {
	dayKeyInTimeZone,
	deriveScheduleDays,
	parseDayKey,
} from "@/lib/schedule/time";
import dynamic from "next/dynamic";
import type { ScheduleSession } from "./schedule-board";

const ScheduleBoard = dynamic(
	() => import("./schedule-board").then((m) => ({ default: m.ScheduleBoard })),
	{ loading: () => <div className="h-64 animate-pulse rounded-lg bg-neutral-900" aria-hidden /> },
);

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

	const db = await getDb();
	const { event } = await assertCanManageEvent(db, eventSlug);

	const [rooms, submissions, slots, tracks] = await Promise.all([
		listEventRooms(db, event.id),
		listSchedulableSubmissions(db, event.id),
		listAgendaSlotsForEvent(db, event.id),
		listAgendaTracks(db, event.id),
	]);
	const days = deriveScheduleDays({
		startDay: event.start_day,
		endDay: event.end_day,
		scheduledDays: slots.map((slot) => dayKeyInTimeZone(slot.starts_at, event.timezone)),
		timeZone: event.timezone,
	});
	const dayKey = parseDayKey(dayParam) && days.includes(dayParam!) ? dayParam! : days[0]!;

	const slotsBySubmission = new Map(
		slots.map((slot) => [slot.submission_id, slot] as const),
	);
	const trackNames = new Map(tracks.map((track) => [track.id, track.name]));

	const sessions: ScheduleSession[] = [];
	const speakersBySubmission = await listSpeakersForSubmissions(db, submissions.map((submission) => submission.id));
	for (const row of submissions) {
		const answers = parseAnswers(row.answers_json);
		const speakers = speakersBySubmission.get(row.id) ?? [];
		// Pending co-speakers stay visible to organizers (flagged), and still
		// count for double-booking; declined/removed drop out entirely.
		const active = speakers.filter(
			(speaker) =>
				speaker.status === "confirmed" || speaker.status === "pending",
		);
		const slot = slotsBySubmission.get(row.id) ?? null;
		sessions.push({
			id: row.id,
		title: titleFromAnswers(answers),
		category: displayCategory(row.category),
			status: row.status,
			submitterName: row.submitter_name,
			durationMinutes: durationMinutesFromAnswers(answers),
			speakerKeys: active.map((speaker) =>
				normalizeSpeakerKey(speaker.email),
			),
			speakerLabels: active.map((speaker) =>
				speaker.status === "pending"
					? `${speaker.name || speaker.email} (pending)`
					: speaker.name || speaker.email,
			),
			slot: slot
				? {
						roomId: slot.room_id,
						roomName: slot.room_name,
						trackId: slot.track_id ?? null,
						trackName: slot.track_id ? trackNames.get(slot.track_id) ?? "Retired track" : "Unassigned",
						startsAtMs: slot.starts_at,
						endsAtMs: slot.ends_at,
					}
				: null,
		});
	}

	const roomNames = rooms.map((room) => room.name);
	const roomIds = Object.fromEntries(rooms.map((room) => [room.name, room.id]));

	return (
		<div className="min-h-dvh bg-neutral-950 text-neutral-200">
			<AdminEventNav eventSlug={event.slug} />
			<main className="mx-auto max-w-6xl px-4 py-10">
				<PageHeader
					eyebrow="Organizer · Schedule"
					title={event.name}
					description="Place or drag accepted talks onto the grid. Room, speaker, and configured track conflicts are blocked and shown loudly."
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
						days={days}
						rooms={roomNames}
						roomIds={roomIds}
						tracks={tracks.map((track) => ({ id: track.id, name: track.name }))}
						dayStartMinutes={event.day_start_minutes ?? 9 * 60}
						dayEndMinutes={event.day_end_minutes ?? 18 * 60}
						slotDurationMinutes={event.slot_duration_minutes ?? 30}
						sessions={sessions}
					/>
				)}
			</main>
		</div>
	);
}
