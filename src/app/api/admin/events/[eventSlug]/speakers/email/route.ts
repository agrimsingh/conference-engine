import { NextResponse } from "next/server";
import { authorizeWritableEventAdminApi } from "@/lib/auth/admin";
import { isJsonObject, readBoundedJson } from "@/lib/cfp/request";
import { getCloudflareEnv, getDb } from "@/lib/db/cloudflare";
import { emailRosterSpeakers, filterRosterSpeakers, isSpeakerWorkflowStatus, listEventSpeakerRoster } from "@/lib/speakers/roster";
import { broadcastEventInvalidate } from "@/lib/realtime/event-room";

type RouteContext = {
	params: Promise<{ eventSlug: string }>;
};

export async function POST(request: Request, context: RouteContext) {
	const { eventSlug } = await context.params;
	const db = await getDb();
	const authorization = await authorizeWritableEventAdminApi(db, eventSlug);
	if (!authorization.ok) return authorization.response;
	const event = authorization.access.event;

	const parsed = await readBoundedJson(request, 32 * 1024);
	if (!parsed.ok) return NextResponse.json({ ok: false, error: parsed.error }, { status: parsed.status });
	if (!isJsonObject(parsed.value)) {
		return NextResponse.json({ ok: false, error: "Expected JSON object" }, { status: 400 });
	}

	let personIds: string[] = [];
	if (Array.isArray(parsed.value.personIds)) {
		if (
			parsed.value.personIds.length === 0
			|| parsed.value.personIds.length > 100
			|| parsed.value.personIds.some((value) => typeof value !== "string" || !value.trim())
		) {
			return NextResponse.json(
				{ ok: false, error: "personIds must contain 1 to 100 non-empty strings" },
				{ status: 400 },
			);
		}
		personIds = [...new Set(parsed.value.personIds.map((value) => String(value).trim()))];
	} else {
		const statusRaw = typeof parsed.value.status === "string" ? parsed.value.status : "all";
		const q = typeof parsed.value.q === "string" ? parsed.value.q : undefined;
		if (statusRaw !== "all" && !isSpeakerWorkflowStatus(statusRaw)) {
			return NextResponse.json({ ok: false, error: "Invalid status filter" }, { status: 400 });
		}
		const roster = await listEventSpeakerRoster(db, event.id);
		personIds = filterRosterSpeakers(roster, {
			status: statusRaw === "all" ? "all" : statusRaw,
			q,
		}).map((speaker) => speaker.personId);
	}

	if (personIds.length === 0) {
		return NextResponse.json({ ok: false, error: "No speakers match the current filter" }, { status: 400 });
	}

	const env = await getCloudflareEnv();
	const result = await emailRosterSpeakers(env, { eventId: event.id, personIds });
	if (result.error) {
		return NextResponse.json({ ok: false, error: result.error }, { status: 400 });
	}
	if (result.configurationError) {
		return NextResponse.json({ ok: false, error: result.configurationError }, { status: 503 });
	}

	const broadcasted = result.sent > 0
		? await broadcastEventInvalidate(event.id, "email.reminders")
		: false;
	return NextResponse.json({
		ok: true,
		sent: result.sent,
		skipped: result.skipped,
		recipients: personIds.length,
		broadcasted,
	});
}
