import type { SpeakerProfileRow } from "@/lib/db/types";
import { DemoEventWriteError, requireWritableEventById } from "@/lib/events/writability";

export type UpdateSpeakerProfileResult =
	| { ok: true; profile: SpeakerProfileRow }
	| { ok: false; error: string; status: number };

/**
 * A profile is event-scoped. Membership is derived from a proposal in that
 * event, never from a global email match, so a valid portal session cannot
 * alter a same-person profile in an unrelated event.
 */
export async function updateSpeakerProfile(
	db: D1Database,
	args: { eventId: string; personId: string; displayName: string; bio: string },
): Promise<UpdateSpeakerProfileResult> {
	try {
		await requireWritableEventById(db, args.eventId);
	} catch (error) {
		if (error instanceof DemoEventWriteError) return { ok: false, error: "This demo event is read-only", status: 403 };
		throw error;
	}
	const connected = await db.prepare(
		`SELECT 1 FROM submissions s
		 LEFT JOIN submission_speakers ss ON ss.submission_id = s.id
		 WHERE s.event_id = ? AND (s.submitter_person_id = ? OR ss.person_id = ?)
		 LIMIT 1`,
	).bind(args.eventId, args.personId, args.personId).first<{ 1: number }>();
	if (!connected) return { ok: false, error: "Forbidden", status: 403 };
	const displayName = args.displayName.trim();
	const bio = args.bio.trim();
	if (!displayName || displayName.length > 160) return { ok: false, error: "Display name must be between 1 and 160 characters", status: 400 };
	if (bio.length > 10_000) return { ok: false, error: "Bio is too long (max 10000 characters)", status: 400 };
	const now = Date.now();
	const profile = await db.prepare(
		`INSERT INTO speaker_profiles (
			id, event_id, person_id, display_name, bio, headshot_asset_id, created_at, updated_at
		) VALUES (?, ?, ?, ?, ?, NULL, ?, ?)
		ON CONFLICT(event_id, person_id) DO UPDATE SET
			display_name = excluded.display_name, bio = excluded.bio, updated_at = excluded.updated_at
		RETURNING *`,
	).bind(crypto.randomUUID(), args.eventId, args.personId, displayName, bio || null, now, now).first<SpeakerProfileRow>();
	if (!profile) return { ok: false, error: "Profile update failed", status: 500 };
	// Session rows are snapshots for invitations, but keeping rows owned by this
	// person aligned makes the organizer's accepted-session view immediately useful.
	await db.prepare(
		`UPDATE submission_speakers SET name = ?, bio = ?
		 WHERE person_id = ? AND submission_id IN (SELECT id FROM submissions WHERE event_id = ?)`,
	).bind(displayName, bio || null, args.personId, args.eventId).run();
	return { ok: true, profile };
}
