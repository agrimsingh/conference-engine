import { NextResponse } from "next/server";
import { getDb } from "@/lib/db/cloudflare";
import { buildEmbedIcal, buildPublicEmbedPayload } from "@/lib/embeds/embed";

type Context = { params: Promise<{ eventSlug: string; embedSlug: string }> };
export async function GET(_request: Request, context: Context) { const { eventSlug, embedSlug } = await context.params; const payload = await buildPublicEmbedPayload(await getDb(), eventSlug, embedSlug); if (!payload) return NextResponse.json({ ok: false, error: "Embed not found" }, { status: 404 }); return new NextResponse(buildEmbedIcal(payload), { headers: { "Content-Type": "text/calendar; charset=utf-8", "Content-Disposition": `attachment; filename="${embedSlug}.ics"`, "Cache-Control": "public, max-age=60", "X-Content-Type-Options": "nosniff" } }); }
