import { NextResponse } from "next/server";
import { isJsonObject, readBoundedJson } from "@/lib/cfp/request";
import { getDb } from "@/lib/db/cloudflare";
import { updateSpeakerProfile } from "@/lib/speakers/profile";
import { readPortalSessionFromCookie } from "@/lib/speakers/portal-session";

type RouteContext = { params: Promise<{ eventId: string }> };

export async function PUT(request: Request, context: RouteContext) {
	const session = await readPortalSessionFromCookie();
	if (!session) return NextResponse.json({ ok: false, error: "Invalid or expired token" }, { status: 401 });
	const parsed = await readBoundedJson(request, 32 * 1024);
	if (!parsed.ok || !isJsonObject(parsed.value)) return NextResponse.json({ ok: false, error: parsed.ok ? "Expected JSON object" : parsed.error }, { status: parsed.ok ? 400 : parsed.status });
	const { displayName, bio, jobTitle, company, social } = parsed.value;
	if (typeof displayName !== "string" || typeof bio !== "string") return NextResponse.json({ ok: false, error: "displayName and bio are required" }, { status: 400 });
	if (jobTitle != null && typeof jobTitle !== "string") return NextResponse.json({ ok: false, error: "jobTitle must be a string" }, { status: 400 });
	if (company != null && typeof company !== "string") return NextResponse.json({ ok: false, error: "company must be a string" }, { status: 400 });
	if (social != null && (typeof social !== "object" || Array.isArray(social))) return NextResponse.json({ ok: false, error: "social must be an object" }, { status: 400 });
	const { eventId } = await context.params;
	const result = await updateSpeakerProfile(await getDb(), {
		eventId,
		personId: session.personId,
		displayName,
		bio,
		jobTitle: typeof jobTitle === "string" ? jobTitle : null,
		company: typeof company === "string" ? company : null,
		social: social ?? null,
	});
	return result.ok ? NextResponse.json(result) : NextResponse.json(result, { status: result.status });
}
