import { NextResponse } from "next/server";
import { requireV1ReadAccess } from "@/lib/auth/public-api";
import { getDb } from "@/lib/db/cloudflare";
import {
	getEventBySlug,
	listAgendaTracks,
	listAgendaSlotsWithSubmissions,
	listEventRooms,
	listSpeakersForSubmissions,
} from "@/lib/db/queries";
import { isPublicAgendaVisibility, isPublicScheduleStatus, titleFromAnswers } from "@/lib/domain";
import { publicScheduleTrack } from "@/lib/schedule/public-tracks";
import { safeExternalUrl } from "@/lib/sessions/session";

type RouteContext = {
	params: Promise<{ eventSlug: string }>;
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

export async function GET(request: Request, context: RouteContext) {
	const { eventSlug } = await context.params;
	const auth = await requireV1ReadAccess(request, eventSlug);
	if (!auth.ok) return auth.response;

	const db = await getDb();
	const event = await getEventBySlug(db, eventSlug);
	if (!event) {
		return NextResponse.json({ ok: false, error: "Event not found" }, { status: 404 });
	}

	const [rooms, slots, tracks] = await Promise.all([
		listEventRooms(db, event.id),
		listAgendaSlotsWithSubmissions(db, event.id),
		listAgendaTracks(db, event.id, { includeRetired: true }),
	]);

	const publicSlots = slots.filter(
		(slot) =>
			isPublicScheduleStatus(slot.submission_status) &&
			isPublicAgendaVisibility(slot.agenda_visibility) &&
			slot.content_approved === 1,
	);
	const speakersBySubmission = await listSpeakersForSubmissions(
		db,
		publicSlots.map((slot) => slot.submission_id),
	);

	const items = [];
	for (const slot of publicSlots) {
		const answers = {
			...parseAnswers(slot.answers_json),
			...parseAnswers(slot.approved_answers_json ?? "{}"),
		};
		const speakers = speakersBySubmission.get(slot.submission_id) ?? [];
		const track = publicScheduleTrack(slot.track_id, tracks);
		items.push({
			id: slot.id,
			submissionId: slot.submission_id,
			title: titleFromAnswers(answers),
			status: slot.submission_status,
			roomName: slot.room_name,
			trackId: track.id,
			trackName: track.name,
			trackRetired: track.retired,
			detailUrl: `/e/${event.slug}/sessions/${slot.submission_id}`,
			media: {
				videoUrl: safeExternalUrl(slot.video_url),
				googleDocUrl: safeExternalUrl(slot.google_doc_url),
				supportingUrl: safeExternalUrl(slot.supporting_url),
			},
			startsAt: slot.starts_at,
			endsAt: slot.ends_at,
			// Public schedule payload mirrors the public page: confirmed only.
			speakers: speakers
				.filter((speaker) => speaker.status === "confirmed")
				.map((speaker) => ({
					name: speaker.name,
					email: speaker.email,
				})),
		});
	}

	return NextResponse.json({
		ok: true,
		event: {
			id: event.id,
			slug: event.slug,
			name: event.name,
			timezone: event.timezone,
		},
		rooms: rooms.map((room) => ({
			id: room.id,
			name: room.name,
			position: room.position,
		})),
		slots: items,
	});
}
