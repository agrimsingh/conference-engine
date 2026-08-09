import { NextResponse } from "next/server";
import { isJsonObject, readBoundedJson } from "@/lib/cfp/request";
import { getDb, getFilesBucket } from "@/lib/db/cloudflare";
import { uploadSpeakerHeadshot } from "@/lib/speakers/headshot";
import { MultipartBodyTooLargeError, readBoundedMultipartFormData } from "@/lib/security/bounded-multipart";
import { updateSpeakerProfile } from "@/lib/speakers/profile";
import { readPortalSessionFromCookie } from "@/lib/speakers/portal-session";

type RouteContext = { params: Promise<{ eventId: string }> };

export async function PUT(request: Request, context: RouteContext) {
	const session = await readPortalSessionFromCookie();
	if (!session) return NextResponse.json({ ok: false, error: "Invalid or expired token" }, { status: 401 });
	const parsed = await readBoundedJson(request, 32 * 1024);
	if (!parsed.ok || !isJsonObject(parsed.value)) return NextResponse.json({ ok: false, error: parsed.ok ? "Expected JSON object" : parsed.error }, { status: parsed.ok ? 400 : parsed.status });
	const { displayName, bio, jobTitle, company, salutation, pronouns, honorific, social } = parsed.value;
	if (typeof displayName !== "string" || typeof bio !== "string") return NextResponse.json({ ok: false, error: "displayName and bio are required" }, { status: 400 });
	if (jobTitle != null && typeof jobTitle !== "string") return NextResponse.json({ ok: false, error: "jobTitle must be a string" }, { status: 400 });
	if (company != null && typeof company !== "string") return NextResponse.json({ ok: false, error: "company must be a string" }, { status: 400 });
	if (salutation != null && typeof salutation !== "string") return NextResponse.json({ ok: false, error: "salutation must be a string" }, { status: 400 });
	if (pronouns != null && typeof pronouns !== "string") return NextResponse.json({ ok: false, error: "pronouns must be a string" }, { status: 400 });
	if (honorific != null && typeof honorific !== "string") return NextResponse.json({ ok: false, error: "honorific must be a string" }, { status: 400 });
	if (social != null && (typeof social !== "object" || Array.isArray(social))) return NextResponse.json({ ok: false, error: "social must be an object" }, { status: 400 });
	const { eventId } = await context.params;
	const result = await updateSpeakerProfile(await getDb(), {
		eventId,
		personId: session.personId,
		displayName,
		bio,
		jobTitle: typeof jobTitle === "string" ? jobTitle : null,
		company: typeof company === "string" ? company : null,
		salutation: typeof salutation === "string" ? salutation : null,
		pronouns: typeof pronouns === "string" ? pronouns : null,
		honorific: typeof honorific === "string" ? honorific : null,
		social: social ?? null,
	});
	return result.ok ? NextResponse.json(result) : NextResponse.json(result, { status: result.status });
}

export async function POST(request: Request, context: RouteContext) {
	const session = await readPortalSessionFromCookie();
	if (!session) return NextResponse.json({ ok: false, error: "Invalid or expired token" }, { status: 401 });
	let form: FormData;
	try { form = await readBoundedMultipartFormData(request, 5 * 1024 * 1024 + 256 * 1024); }
	catch (error) { return NextResponse.json({ ok: false, error: error instanceof MultipartBodyTooLargeError ? "Headshot is too large (max 5MB)" : "Expected multipart form" }, { status: error instanceof MultipartBodyTooLargeError ? 413 : 400 }); }
	const file = form.get("file");
	if (!(file instanceof File)) return NextResponse.json({ ok: false, error: "Choose a headshot" }, { status: 400 });
	const { eventId } = await context.params;
	const result = await uploadSpeakerHeadshot(await getDb(), await getFilesBucket(), { eventId, personId: session.personId, file });
	return result.ok ? NextResponse.json(result) : NextResponse.json(result, { status: result.status });
}
