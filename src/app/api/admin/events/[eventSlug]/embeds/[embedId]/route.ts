import { NextResponse } from "next/server";
import { authorizeWritableEventAdminApi } from "@/lib/auth/admin";
import { isJsonObject, readBoundedJson } from "@/lib/cfp/request";
import { getDb } from "@/lib/db/cloudflare";
import {
	EMBED_STATUSES,
	buildEmbedUrls,
	deleteEmbed,
	parseEmbedInput,
	setEmbedStatus,
	updateEmbed,
	type EmbedStatus,
} from "@/lib/embeds/embed";

type Context = { params: Promise<{ eventSlug: string; embedId: string }> };

function isStatusOnly(body: Record<string, unknown>): body is { status: EmbedStatus } {
	const keys = Object.keys(body);
	return keys.length === 1 && keys[0] === "status" && typeof body.status === "string"
		&& (EMBED_STATUSES as readonly string[]).includes(body.status);
}

export async function PATCH(request: Request, context: Context) {
	const { eventSlug, embedId } = await context.params;
	const db = await getDb();
	const auth = await authorizeWritableEventAdminApi(db, eventSlug);
	if (!auth.ok) return auth.response;
	const body = await readBoundedJson(request, 16 * 1024);
	if (!body.ok) return NextResponse.json({ ok: false, error: body.error }, { status: body.status });
	if (!isJsonObject(body.value)) return NextResponse.json({ ok: false, error: "Expected JSON object" }, { status: 400 });

	if (isStatusOnly(body.value)) {
		const embed = await setEmbedStatus(db, auth.access.event.id, embedId, body.value.status);
		if (!embed) return NextResponse.json({ ok: false, error: "Embed not found" }, { status: 404 });
		return NextResponse.json({
			ok: true,
			embed: { ...embed, urls: buildEmbedUrls(new URL(request.url).origin, eventSlug, embed.slug) },
		});
	}

	const parsed = parseEmbedInput(body.value);
	if (!parsed.ok) return NextResponse.json(parsed, { status: 400 });
	try {
		const embed = await updateEmbed(db, auth.access.event.id, embedId, parsed.value);
		if (!embed) return NextResponse.json({ ok: false, error: "Embed not found" }, { status: 404 });
		return NextResponse.json({
			ok: true,
			embed: { ...embed, urls: buildEmbedUrls(new URL(request.url).origin, eventSlug, embed.slug) },
		});
	} catch {
		return NextResponse.json({ ok: false, error: "That embed slug is already in use" }, { status: 409 });
	}
}

export async function DELETE(_request: Request, context: Context) {
	const { eventSlug, embedId } = await context.params;
	const db = await getDb();
	const auth = await authorizeWritableEventAdminApi(db, eventSlug);
	if (!auth.ok) return auth.response;
	return (await deleteEmbed(db, auth.access.event.id, embedId))
		? NextResponse.json({ ok: true })
		: NextResponse.json({ ok: false, error: "Embed not found" }, { status: 404 });
}
