import {
	getEventBySlug,
	listAgendaTracks,
	listAgendaSlotsWithSubmissions,
	listEventRooms,
	listSpeakerProfileCardsForPeople,
	listSpeakersForSubmissions,
} from "@/lib/db/queries";
import { isPublicAgendaVisibility, isPublicScheduleStatus, titleFromAnswers } from "@/lib/domain";
import { publicScheduleTrack } from "@/lib/schedule/public-tracks";
import { safeExternalUrl } from "@/lib/sessions/session";

export type PublicScheduleSpeakerJson = {
	personId: string | null;
	name: string;
	jobTitle: string | null;
	company: string | null;
	hasHeadshot: boolean;
	profileUrl: string | null;
};

export type PublicScheduleSlotJson = {
	id: string;
	sessionId: string;
	title: string;
	roomName: string;
	track: {
		id: string | null;
		name: string;
		retired: boolean;
	};
	startsAt: number;
	endsAt: number;
	detailUrl: string;
	media: {
		videoUrl: string | null;
		googleDocUrl: string | null;
		supportingUrl: string | null;
	};
	speakers: PublicScheduleSpeakerJson[];
};

export type PublicScheduleJson = {
	ok: true;
	event: {
		slug: string;
		name: string;
		timezone: string;
		startDay: string | null;
		endDay: string | null;
	};
	rooms: Array<{ id: string; name: string; position: number }>;
	tracks: Array<{ id: string; name: string; slug: string; position: number; retired: boolean }>;
	slots: PublicScheduleSlotJson[];
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

/** Published agenda only; strips emails, submitter fields, and raw answers. */
export async function buildPublicScheduleJson(
	db: D1Database,
	eventSlug: string,
): Promise<PublicScheduleJson | null> {
	const event = await getEventBySlug(db, eventSlug);
	if (!event) return null;

	const [rooms, slots, tracks] = await Promise.all([
		listEventRooms(db, event.id),
		listAgendaSlotsWithSubmissions(db, event.id),
		listAgendaTracks(db, event.id, { includeRetired: true }),
	]);

	const publicSlots = slots.filter((slot) =>
		isPublicScheduleStatus(slot.submission_status) &&
		isPublicAgendaVisibility(slot.agenda_visibility) &&
		slot.content_approved === 1,
	);
	const speakersBySubmission = await listSpeakersForSubmissions(
		db,
		publicSlots.map((slot) => slot.submission_id),
	);
	const personIds = [
		...new Set(
			[...speakersBySubmission.values()]
				.flat()
				.filter((speaker) => speaker.status === "confirmed" && speaker.person_id)
				.map((speaker) => speaker.person_id!),
		),
	];
	const profileByPerson = await listSpeakerProfileCardsForPeople(db, event.id, personIds);

	const items: PublicScheduleSlotJson[] = [];
	for (const slot of publicSlots) {
		const answers = { ...parseAnswers(slot.answers_json), ...parseAnswers(slot.approved_answers_json ?? "{}") };
		const speakers = speakersBySubmission.get(slot.submission_id) ?? [];
		const track = publicScheduleTrack(slot.track_id, tracks);
		items.push({
			id: slot.id,
			sessionId: slot.submission_id,
			title: titleFromAnswers(answers),
			roomName: slot.room_name,
			track: {
				id: track.id,
				name: track.name,
				retired: track.retired,
			},
			startsAt: slot.starts_at,
			endsAt: slot.ends_at,
			detailUrl: `/e/${event.slug}/sessions/${slot.submission_id}`,
			media: {
				videoUrl: safeExternalUrl(slot.video_url),
				googleDocUrl: safeExternalUrl(slot.google_doc_url),
				supportingUrl: safeExternalUrl(slot.supporting_url),
			},
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
						profileUrl: speaker.person_id
							? `/e/${event.slug}/speakers/${speaker.person_id}`
							: null,
					};
				}),
		});
	}

	return {
		ok: true,
		event: {
			slug: event.slug,
			name: event.name,
			timezone: event.timezone,
			startDay: event.start_day,
			endDay: event.end_day,
		},
		rooms: rooms.map((room) => ({
			id: room.id,
			name: room.name,
			position: room.position,
		})),
		tracks: tracks.map((track) => ({
			id: track.id,
			name: track.name,
			slug: track.slug,
			position: track.position,
			retired: track.soft_deleted === 1,
		})),
		slots: items,
	};
}

/** Guardrail for tests: public schedule payloads must never include contact fields. */
export function publicScheduleJsonContainsPii(payload: unknown): boolean {
	const serialized = JSON.stringify(payload);
	return /"(email|submitterEmail|submitter_email|submitterName|submitter_name|answers_json|answersJson|bio)"\s*:/i.test(serialized)
		|| /@[a-z0-9.-]+\.[a-z]{2,}/i.test(serialized);
}
