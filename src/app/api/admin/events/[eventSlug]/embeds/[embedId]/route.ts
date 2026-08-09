import { NextResponse } from "next/server";
import { authorizeWritableEventAdminApi } from "@/lib/auth/admin";
import { isJsonObject, readBoundedJson } from "@/lib/cfp/request";
import { getDb } from "@/lib/db/cloudflare";
import { buildEmbedUrls, deleteEmbed, parseEmbedInput, updateEmbed } from "@/lib/embeds/embed";

type Context = { params: Promise<{ eventSlug: string; embedId: string }> };
export async function PATCH(request: Request, context: Context) {
	const { eventSlug, embedId } = await context.params; const db = await getDb(); const auth = await authorizeWritableEventAdminApi(db, eventSlug); if (!auth.ok) return auth.response;
	const body = await readBoundedJson(request, 16 * 1024); if (!body.ok) return NextResponse.json({ ok: false, error: body.error }, { status: body.status }); if (!isJsonObject(body.value)) return NextResponse.json({ ok: false, error: "Expected JSON object" }, { status: 400 });
	const parsed = parseEmbedInput(body.value); if (!parsed.ok) return NextResponse.json(parsed, { status: 400 });
	try { const embed = await updateEmbed(db, auth.access.event.id, embedId, parsed.value); if (!embed) return NextResponse.json({ ok: false, error: "Embed not found" }, { status: 404 }); return NextResponse.json({ ok: true, embed: { ...embed, urls: buildEmbedUrls(new URL(request.url).origin, eventSlug, embed.slug) } }); }
	catch { return NextResponse.json({ ok: false, error: "That embed slug is already in use" }, { status: 409 }); }
}
export async function DELETE(_request: Request, context: Context) { const { eventSlug, embedId } = await context.params; const db = await getDb(); const auth = await authorizeWritableEventAdminApi(db, eventSlug); if (!auth.ok) return auth.response; return (await deleteEmbed(db, auth.access.event.id, embedId)) ? NextResponse.json({ ok: true }) : NextResponse.json({ ok: false, error: "Embed not found" }, { status: 404 }); }
