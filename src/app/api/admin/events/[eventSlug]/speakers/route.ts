import { NextResponse } from "next/server";
import { authorizeEventAdminApi, authorizeWritableEventAdminApi } from "@/lib/auth/admin";
import { isJsonObject, readBoundedJson } from "@/lib/cfp/request";
import { getDb } from "@/lib/db/cloudflare";
import {
	importSpeakerRosterCsv,
	isSpeakerWorkflowStatus,
	listEventSpeakerRoster,
	parseSpeakerSocials,
	upsertEventSpeakerProfile,
	type SpeakerSocials,
	type SpeakerWorkflowStatus,
} from "@/lib/speakers/roster";

type RouteContext = {
	params: Promise<{ eventSlug: string }>;
};

export async function GET(request: Request, context: RouteContext) {
	const { eventSlug } = await context.params;
	const db = await getDb();
	const access = await authorizeEventAdminApi(db, eventSlug);
	if (!access) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

	const url = new URL(request.url);
	const statusRaw = url.searchParams.get("status") ?? "all";
	const q = url.searchParams.get("q") ?? undefined;
	const status =
		statusRaw === "all" || isSpeakerWorkflowStatus(statusRaw) ? statusRaw : null;
	if (!status) {
		return NextResponse.json({ ok: false, error: "Invalid status filter" }, { status: 400 });
	}

	const speakers = await listEventSpeakerRoster(db, access.event.id, { status, q });
	return NextResponse.json({ ok: true, speakers });
}

export async function POST(request: Request, context: RouteContext) {
	const { eventSlug } = await context.params;
	const db = await getDb();
	const authorization = await authorizeWritableEventAdminApi(db, eventSlug);
	if (!authorization.ok) return authorization.response;

	const contentType = request.headers.get("content-type") ?? "";
	if (contentType.includes("text/csv") || contentType.includes("application/csv")) {
		const csv = await request.text();
		if (csv.length > 512 * 1024) {
			return NextResponse.json({ ok: false, error: "CSV is too large" }, { status: 413 });
		}
		const imported = await importSpeakerRosterCsv(db, {
			eventId: authorization.access.event.id,
			csv,
		});
		if (!imported.ok) {
			return NextResponse.json(imported, { status: 400 });
		}
		return NextResponse.json(imported);
	}

	const parsed = await readBoundedJson(request, 32 * 1024);
	if (!parsed.ok) return NextResponse.json({ ok: false, error: parsed.error }, { status: parsed.status });
	if (!isJsonObject(parsed.value)) {
		return NextResponse.json({ ok: false, error: "Expected JSON object" }, { status: 400 });
	}

	if (typeof parsed.value.csv === "string") {
		const imported = await importSpeakerRosterCsv(db, {
			eventId: authorization.access.event.id,
			csv: parsed.value.csv,
		});
		if (!imported.ok) return NextResponse.json(imported, { status: 400 });
		return NextResponse.json(imported);
	}

	const email = typeof parsed.value.email === "string" ? parsed.value.email : "";
	const name = typeof parsed.value.name === "string" ? parsed.value.name : "";
	const jobTitle = typeof parsed.value.jobTitle === "string" ? parsed.value.jobTitle : null;
	const company = typeof parsed.value.company === "string" ? parsed.value.company : null;
	const bio = typeof parsed.value.bio === "string" ? parsed.value.bio : null;
	const logisticsText = typeof parsed.value.logisticsText === "string" ? parsed.value.logisticsText : null;
	const workflowStatus = parsed.value.workflowStatus;
	if (workflowStatus !== undefined && !isSpeakerWorkflowStatus(workflowStatus)) {
		return NextResponse.json({ ok: false, error: "Invalid workflow status" }, { status: 400 });
	}
	const socials = parseSocialsInput(parsed.value.socials);

	const result = await upsertEventSpeakerProfile(db, {
		eventId: authorization.access.event.id,
		input: {
			email,
			name,
			jobTitle,
			company,
			bio,
			logisticsText,
			socials,
			workflowStatus: workflowStatus as SpeakerWorkflowStatus | undefined,
		},
	});
	if (!result.ok) return NextResponse.json({ ok: false, error: result.error }, { status: result.status });
	return NextResponse.json({ ok: true, speaker: result.speaker });
}

function parseSocialsInput(raw: unknown): SpeakerSocials {
	if (typeof raw === "string") return parseSpeakerSocials(raw);
	if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
	const out: SpeakerSocials = {};
	for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
		if (typeof value === "string") out[key as keyof SpeakerSocials] = value;
	}
	return parseSpeakerSocials(JSON.stringify(out));
}
