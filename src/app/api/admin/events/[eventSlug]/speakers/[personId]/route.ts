import { NextResponse } from "next/server";
import { authorizeWritableEventAdminApi } from "@/lib/auth/admin";
import { isJsonObject, readBoundedJson } from "@/lib/cfp/request";
import { getDb } from "@/lib/db/cloudflare";
import {
	isSpeakerWorkflowStatus,
	listEventSpeakerRoster,
	parseSpeakerSocials,
	upsertEventSpeakerProfile,
	type SpeakerSocials,
	type SpeakerWorkflowStatus,
} from "@/lib/speakers/roster";

type RouteContext = {
	params: Promise<{ eventSlug: string; personId: string }>;
};

export async function PATCH(request: Request, context: RouteContext) {
	const { eventSlug, personId } = await context.params;
	const db = await getDb();
	const authorization = await authorizeWritableEventAdminApi(db, eventSlug);
	if (!authorization.ok) return authorization.response;

	const existing = (await listEventSpeakerRoster(db, authorization.access.event.id)).find(
		(speaker) => speaker.personId === personId,
	);
	if (!existing) return NextResponse.json({ ok: false, error: "Speaker not found" }, { status: 404 });

	const parsed = await readBoundedJson(request, 32 * 1024);
	if (!parsed.ok) return NextResponse.json({ ok: false, error: parsed.error }, { status: parsed.status });
	if (!isJsonObject(parsed.value)) {
		return NextResponse.json({ ok: false, error: "Expected JSON object" }, { status: 400 });
	}

	const email = typeof parsed.value.email === "string" ? parsed.value.email : existing.email;
	const name = typeof parsed.value.name === "string" ? parsed.value.name : existing.name;
	const jobTitle =
		parsed.value.jobTitle === null
			? null
			: typeof parsed.value.jobTitle === "string"
				? parsed.value.jobTitle
				: existing.jobTitle;
	const company =
		parsed.value.company === null
			? null
			: typeof parsed.value.company === "string"
				? parsed.value.company
				: existing.company;
	const bio = parsed.value.bio === null ? null : typeof parsed.value.bio === "string" ? parsed.value.bio : existing.bio;
	const logisticsText = parsed.value.logisticsText === null ? null : typeof parsed.value.logisticsText === "string" ? parsed.value.logisticsText : existing.logisticsText;
	const workflowStatus =
		parsed.value.workflowStatus === undefined
			? existing.workflowStatus
			: parsed.value.workflowStatus;
	if (!isSpeakerWorkflowStatus(workflowStatus)) {
		return NextResponse.json({ ok: false, error: "Invalid workflow status" }, { status: 400 });
	}
	const socials =
		parsed.value.socials === undefined
			? existing.socials
			: parseSocialsInput(parsed.value.socials);

	const result = await upsertEventSpeakerProfile(db, {
		eventId: authorization.access.event.id,
		personId,
		input: {
			email,
			name,
			jobTitle,
			company,
			bio,
			logisticsText,
			socials,
			workflowStatus: workflowStatus as SpeakerWorkflowStatus,
		},
	});
	if (!result.ok) return NextResponse.json({ ok: false, error: result.error }, { status: result.status });
	return NextResponse.json({ ok: true, speaker: result.speaker });
}

function parseSocialsInput(raw: unknown): SpeakerSocials {
	if (typeof raw === "string") return parseSpeakerSocials(raw);
	if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
	return parseSpeakerSocials(JSON.stringify(raw));
}
