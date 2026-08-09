import { NextResponse } from "next/server";
import { authorizeWritableEventAdminApi } from "@/lib/auth/admin";
import { isJsonObject, readBoundedJson } from "@/lib/cfp/request";
import { updateSpeakerContent } from "@/lib/content/speaker-content";
import { getDb, getFilesBucket } from "@/lib/db/cloudflare";
import { MultipartBodyTooLargeError, readBoundedMultipartFormData } from "@/lib/security/bounded-multipart";

async function auth(eventSlug: string) { const db = await getDb(); const result = await authorizeWritableEventAdminApi(db, eventSlug); return { db, result }; }

export async function PATCH(request: Request, context: { params: Promise<{ eventSlug: string; personId: string }> }) {
	const { eventSlug, personId } = await context.params; const { db, result } = await auth(eventSlug); if (!result.ok) return result.response; if (!result.access.account) return NextResponse.json({ ok: false, error: "Organizer account required" }, { status: 401 });
	const parsed = await readBoundedJson(request, 16 * 1024); if (!parsed.ok || !isJsonObject(parsed.value) || typeof parsed.value.bio !== "string") return NextResponse.json({ ok: false, error: parsed.ok ? "bio required" : parsed.error }, { status: parsed.ok ? 400 : parsed.status });
	const updated = await updateSpeakerContent(db, { eventId: result.access.event.id, personId, bio: parsed.value.bio, editorAccountId: result.access.account.id, editorName: result.access.account.name?.trim() || result.access.account.email });
	return updated.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ ok: false, error: updated.error }, { status: updated.status });
}

export async function POST(request: Request, context: { params: Promise<{ eventSlug: string; personId: string }> }) {
	const { eventSlug, personId } = await context.params; const { db, result } = await auth(eventSlug); if (!result.ok) return result.response; if (!result.access.account) return NextResponse.json({ ok: false, error: "Organizer account required" }, { status: 401 });
	let form: FormData; try { form = await readBoundedMultipartFormData(request, 25 * 1024 * 1024 + 512 * 1024); } catch (error) { return NextResponse.json({ ok: false, error: error instanceof MultipartBodyTooLargeError ? "Upload too large (max 25MB)" : "Expected multipart form" }, { status: error instanceof MultipartBodyTooLargeError ? 413 : 400 }); }
	const file = form.get("file"); if (!(file instanceof File)) return NextResponse.json({ ok: false, error: "file required" }, { status: 400 }); if (file.size > 25 * 1024 * 1024) return NextResponse.json({ ok: false, error: "Upload too large (max 25MB)" }, { status: 413 }); if (!['image/png','image/jpeg','image/webp'].includes(file.type)) return NextResponse.json({ ok: false, error: "Headshot must be PNG, JPEG, or WebP" }, { status: 400 });
	const assetId = crypto.randomUUID(); const safeName = file.name.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 120) || "headshot"; const key = `events/${result.access.event.id}/people/${personId}/profile/${assetId}-${safeName}`; const bucket = await getFilesBucket(); await bucket.put(key, await file.arrayBuffer(), { httpMetadata: { contentType: file.type } });
	try { await db.prepare("INSERT INTO assets (id, event_id, r2_key, content_type, filename, uploaded_by_person_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)").bind(assetId, result.access.event.id, key, file.type, safeName, personId, Date.now()).run(); const updated = await updateSpeakerContent(db, { eventId: result.access.event.id, personId, headshotAssetId: assetId, editorAccountId: result.access.account.id, editorName: result.access.account.name?.trim() || result.access.account.email }); if (!updated.ok) throw new Error(updated.error); return NextResponse.json({ ok: true, assetId }); } catch (error) { try { await db.prepare("DELETE FROM assets WHERE id = ? AND event_id = ?").bind(assetId, result.access.event.id).run(); } catch {} try { await bucket.delete(key); } catch {} return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Upload failed" }, { status: 400 }); }
}
