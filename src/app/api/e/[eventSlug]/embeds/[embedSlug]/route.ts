import { NextResponse } from "next/server";
import { getDb } from "@/lib/db/cloudflare";
import { buildPublicEmbedPayload } from "@/lib/embeds/embed";

type Context = { params: Promise<{ eventSlug: string; embedSlug: string }> };
export async function GET(_request: Request, context: Context) { const { eventSlug, embedSlug } = await context.params; const payload = await buildPublicEmbedPayload(await getDb(), eventSlug, embedSlug); if (!payload) return NextResponse.json({ ok: false, error: "Embed not found" }, { status: 404 }); return NextResponse.json(payload, { headers: { "Cache-Control": "public, max-age=60, stale-while-revalidate=300", "X-Content-Type-Options": "nosniff", "Access-Control-Allow-Origin": "*" } }); }
