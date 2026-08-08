import { NextResponse } from "next/server";
import { requirePublicApiKey } from "@/lib/auth/public-api";
import { getDb } from "@/lib/db/cloudflare";
import {
	getEventBySlug,
	listAgendaSlotsWithSubmissions,
	listEventRooms,
	listSpeakersForSubmission,
} from "@/lib/db/queries";
import { isPublicScheduleStatus, titleFromAnswers } from "@/lib/domain";

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
	const auth = await requirePublicApiKey(request);
	if (!auth.ok) return auth.response;

	const { eventSlug } = await context.params;
	const db = await getDb();
	const event = await getEventBySlug(db, eventSlug);
	if (!event) {
		return NextResponse.json({ ok: false, error: "Event not found" }, { status: 404 });
	}

	const [rooms, slots] = await Promise.all([
		listEventRooms(db, event.id),
		listAgendaSlotsWithSubmissions(db, event.id),
	]);

	const publicSlots = slots.filter((slot) =>
		isPublicScheduleStatus(slot.submission_status),
	);

	const items = [];
	for (const slot of publicSlots) {
		const answers = parseAnswers(slot.answers_json);
		const speakers = await listSpeakersForSubmission(db, slot.submission_id);
		items.push({
			id: slot.id,
			submissionId: slot.submission_id,
			title: titleFromAnswers(answers),
			status: slot.submission_status,
			roomName: slot.room_name,
			startsAt: slot.starts_at,
			endsAt: slot.ends_at,
			speakers: speakers.map((speaker) => ({
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
