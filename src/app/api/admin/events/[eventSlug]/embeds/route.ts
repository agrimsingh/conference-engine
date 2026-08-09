import { NextResponse } from "next/server";
import { authorizeEventAdminApi, authorizeWritableEventAdminApi } from "@/lib/auth/admin";
import { isJsonObject, readBoundedJson } from "@/lib/cfp/request";
import { getDb } from "@/lib/db/cloudflare";
import { buildEmbedUrls, createEmbed, listEmbeds, parseEmbedInput } from "@/lib/embeds/embed";

type Context = { params: Promise<{ eventSlug: string }> };
function view(request: Request, eventSlug: string, embed: Awaited<ReturnType<typeof createEmbed>>) { return { ...embed, urls: buildEmbedUrls(new URL(request.url).origin, eventSlug, embed.slug) }; }

export async function GET(request: Request, context: Context) {
	const { eventSlug } = await context.params; const db = await getDb(); const access = await authorizeEventAdminApi(db, eventSlug);
	if (!access) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
	const embeds = await listEmbeds(db, access.event.id);
	return NextResponse.json({ ok: true, embeds: embeds.map((embed) => ({ ...embed, urls: buildEmbedUrls(new URL(request.url).origin, eventSlug, embed.slug) })) });
}

export async function POST(request: Request, context: Context) {
	const { eventSlug } = await context.params; const db = await getDb(); const auth = await authorizeWritableEventAdminApi(db, eventSlug);
	if (!auth.ok) return auth.response;
	const parsedBody = await readBoundedJson(request, 16 * 1024);
	if (!parsedBody.ok) return NextResponse.json({ ok: false, error: parsedBody.error }, { status: parsedBody.status });
	if (!isJsonObject(parsedBody.value)) return NextResponse.json({ ok: false, error: "Expected JSON object" }, { status: 400 });
	const parsed = parseEmbedInput(parsedBody.value); if (!parsed.ok) return NextResponse.json(parsed, { status: 400 });
	try { const embed = await createEmbed(db, auth.access.event.id, parsed.value); return NextResponse.json({ ok: true, embed: view(request, eventSlug, embed) }, { status: 201 }); }
	catch (error) { return NextResponse.json({ ok: false, error: error instanceof Error && /UNIQUE/.test(error.message) ? "That embed slug is already in use" : "Unable to create embed" }, { status: 409 }); }
}
