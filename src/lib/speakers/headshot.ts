import type { AssetRow } from "@/lib/db/types";
import { DemoEventWriteError, requireWritableEventById } from "@/lib/events/writability";

const TYPES = ["image/png", "image/jpeg", "image/webp"];
export const MAX_HEADSHOT_BYTES = 5 * 1024 * 1024;

export async function uploadSpeakerHeadshot(db: D1Database, files: R2Bucket, args: { eventId: string; personId: string; file: File }): Promise<{ ok: true; asset: AssetRow } | { ok: false; error: string; status: number }> {
	try { await requireWritableEventById(db, args.eventId); } catch (error) { if (error instanceof DemoEventWriteError) return { ok: false, error: "This event is read-only", status: 403 }; throw error; }
	const member = await db.prepare("SELECT 1 FROM event_speaker_profiles WHERE event_id = ? AND person_id = ?").bind(args.eventId, args.personId).first();
	if (!member) return { ok: false, error: "Forbidden", status: 403 };
	if (!TYPES.includes(args.file.type)) return { ok: false, error: "Headshot must be PNG, JPEG, or WebP", status: 400 };
	if (args.file.size <= 0) return { ok: false, error: "Headshot cannot be empty", status: 400 };
	if (args.file.size > MAX_HEADSHOT_BYTES) return { ok: false, error: "Headshot is too large (max 5MB)", status: 413 };
	const assetId = crypto.randomUUID();
	const filename = (args.file.name.split(/[/\\]/).pop() || "headshot").replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 120);
	const key = `events/${args.eventId}/people/${args.personId}/profile/${assetId}-${filename}`;
	await files.put(key, await args.file.arrayBuffer(), { httpMetadata: { contentType: args.file.type } });
	const now = Date.now();
	try {
		await db.batch([
			db.prepare("INSERT INTO assets (id, event_id, r2_key, content_type, filename, uploaded_by_person_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)").bind(assetId, args.eventId, key, args.file.type, filename, args.personId, now),
			db.prepare("UPDATE speaker_profiles SET headshot_asset_id = ?, updated_at = ? WHERE event_id = ? AND person_id = ?").bind(assetId, now, args.eventId, args.personId),
		]);
	} catch (error) {
		try { await files.delete(key); } catch { /* best effort */ }
		throw error;
	}
	// The previous asset remains an immutable historical blob for content revision
	// restore. Only speaker_profiles.headshot_asset_id advances to the new image.
	return { ok: true, asset: { id: assetId, event_id: args.eventId, r2_key: key, content_type: args.file.type, filename, uploaded_by_person_id: args.personId, created_at: now } };
}

export async function resolveSpeakerHeadshot(db: D1Database, args: { eventId: string; personId: string }): Promise<AssetRow | null> {
	return db.prepare("SELECT a.* FROM speaker_profiles sp JOIN assets a ON a.id = sp.headshot_asset_id AND a.event_id = sp.event_id AND a.uploaded_by_person_id = sp.person_id WHERE sp.event_id = ? AND sp.person_id = ?").bind(args.eventId, args.personId).first<AssetRow>();
}
