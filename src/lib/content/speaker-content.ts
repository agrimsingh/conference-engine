import type { ContentRevisionRow, SpeakerProfileRow } from "@/lib/db/types";

type SpeakerSnapshot = { bio: string; headshotAssetId: string | null };

export async function updateSpeakerContent(db: D1Database, args: { eventId: string; personId: string; bio?: string; headshotAssetId?: string | null; editorAccountId: string; editorName: string }): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
	const profile = await db.prepare("SELECT * FROM speaker_profiles WHERE event_id = ? AND person_id = ?").bind(args.eventId, args.personId).first<SpeakerProfileRow>();
	if (!profile) return { ok: false, status: 404, error: "Speaker not found" };
	const bio = args.bio === undefined ? profile.bio ?? "" : args.bio.trim();
	if (bio.length > 10_000) return { ok: false, status: 400, error: "Bio must be at most 10000 characters" };
	const headshotAssetId = args.headshotAssetId === undefined ? profile.headshot_asset_id : args.headshotAssetId;
	if (headshotAssetId) {
		const asset = await db.prepare("SELECT id FROM assets WHERE id = ? AND event_id = ?").bind(headshotAssetId, args.eventId).first<{ id: string }>();
		if (!asset) return { ok: false, status: 404, error: "Headshot not found" };
	}
	const latest = await db.prepare("SELECT COALESCE(MAX(revision_number), 0) AS n FROM content_revisions WHERE event_id = ? AND entity_type = 'speaker' AND entity_id = ?").bind(args.eventId, args.personId).first<{ n: number }>();
	const revisionId = crypto.randomUUID(); const now = Date.now(); const snapshot: SpeakerSnapshot = { bio, headshotAssetId };
	await db.batch([
		db.prepare("INSERT INTO content_revisions (id, event_id, entity_type, entity_id, revision_number, snapshot_json, editor_account_id, editor_name, created_at) VALUES (?, ?, 'speaker', ?, ?, ?, ?, ?, ?)").bind(revisionId, args.eventId, args.personId, (latest?.n ?? 0) + 1, JSON.stringify(snapshot), args.editorAccountId, args.editorName, now),
		db.prepare("INSERT INTO content_heads (event_id, entity_type, entity_id, current_revision_id, approved_revision_id, updated_at) VALUES (?, 'speaker', ?, ?, NULL, ?) ON CONFLICT(event_id, entity_type, entity_id) DO UPDATE SET current_revision_id = excluded.current_revision_id, updated_at = excluded.updated_at").bind(args.eventId, args.personId, revisionId, now),
		db.prepare("UPDATE speaker_profiles SET bio = ?, headshot_asset_id = ?, updated_at = ? WHERE event_id = ? AND person_id = ?").bind(bio || null, headshotAssetId, now, args.eventId, args.personId),
		db.prepare("UPDATE submission_speakers SET bio = ? WHERE person_id = ? AND submission_id IN (SELECT id FROM submissions WHERE event_id = ?)").bind(bio || null, args.personId, args.eventId),
	]);
	return { ok: true };
}

export async function restoreSpeakerRevision(db: D1Database, args: { eventId: string; personId: string; revisionId: string; editorAccountId: string; editorName: string }) {
	const revision = await db.prepare("SELECT * FROM content_revisions WHERE id = ? AND event_id = ? AND entity_type = 'speaker' AND entity_id = ?").bind(args.revisionId, args.eventId, args.personId).first<ContentRevisionRow>();
	if (!revision) return { ok: false as const, status: 404, error: "Revision not found" };
	let snapshot: SpeakerSnapshot; try { snapshot = JSON.parse(revision.snapshot_json) as SpeakerSnapshot; } catch { return { ok: false as const, status: 409, error: "Revision is invalid" }; }
	return updateSpeakerContent(db, { eventId: args.eventId, personId: args.personId, bio: snapshot.bio, headshotAssetId: snapshot.headshotAssetId, editorAccountId: args.editorAccountId, editorName: args.editorName });
}
