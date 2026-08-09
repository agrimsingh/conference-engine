import type { SpeakerProfileRow } from "@/lib/db/types";
import { DemoEventWriteError, requireWritableEventById } from "@/lib/events/writability";
import { serializeSpeakerSocial, type SpeakerSocialLinks } from "./social";

export type UpdateSpeakerProfileResult =
	| { ok: true; profile: SpeakerProfileRow }
	| { ok: false; error: string; status: number };

export type SpeakerProfileUpdate = {
	eventId: string;
	personId: string;
	displayName: string;
	bio: string;
	jobTitle?: string | null;
	company?: string | null;
	social?: SpeakerSocialLinks | string | null;
};

/**
 * A profile is event-scoped. Membership is derived from a proposal in that
 * event, never from a global email match, so a valid portal session cannot
 * alter a same-person profile in an unrelated event.
 */
export async function updateSpeakerProfile(
	db: D1Database,
	args: SpeakerProfileUpdate,
): Promise<UpdateSpeakerProfileResult> {
	try {
		await requireWritableEventById(db, args.eventId);
	} catch (error) {
		if (error instanceof DemoEventWriteError) return { ok: false, error: "This demo event is read-only", status: 403 };
		throw error;
	}
	const connected = await db.prepare(
		`SELECT 1 FROM event_speaker_profiles WHERE event_id = ? AND person_id = ?
		 UNION ALL
		 SELECT 1 FROM submissions s LEFT JOIN submission_speakers ss ON ss.submission_id = s.id
		 WHERE s.event_id = ? AND (s.submitter_person_id = ? OR ss.person_id = ?) LIMIT 1`,
	).bind(args.eventId, args.personId, args.eventId, args.personId, args.personId).first<{ 1: number }>();
	if (!connected) return { ok: false, error: "Forbidden", status: 403 };
	const displayName = args.displayName.trim();
	const bio = args.bio.trim();
	if (!displayName || displayName.length > 160) return { ok: false, error: "Display name must be between 1 and 160 characters", status: 400 };
	if (bio.length > 10_000) return { ok: false, error: "Bio is too long (max 10000 characters)", status: 400 };
	const jobTitle = optionalText(args.jobTitle, "Job title", 160);
	if (!jobTitle.ok) return jobTitle;
	const company = optionalText(args.company, "Company", 160);
	if (!company.ok) return company;
	let socialJson: string | null = null;
	try {
		socialJson = serializeSpeakerSocial(args.social ?? null);
	} catch (error) {
		return { ok: false, error: error instanceof Error ? error.message : "Invalid social links", status: 400 };
	}
	const now = Date.now();
	const profile = await db.prepare(
		`INSERT INTO speaker_profiles (
			id, event_id, person_id, display_name, bio, job_title, company, social_json,
			headshot_asset_id, created_at, updated_at
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)
		ON CONFLICT(event_id, person_id) DO UPDATE SET
			display_name = excluded.display_name,
			bio = excluded.bio,
			job_title = excluded.job_title,
			company = excluded.company,
			social_json = excluded.social_json,
			updated_at = excluded.updated_at
		RETURNING *`,
	).bind(
		crypto.randomUUID(),
		args.eventId,
		args.personId,
		displayName,
		bio || null,
		jobTitle.value,
		company.value,
		socialJson,
		now,
		now,
	).first<SpeakerProfileRow>();
	if (!profile) return { ok: false, error: "Profile update failed", status: 500 };
	// Session rows are snapshots for invitations, but keeping rows owned by this
	// person aligned makes the organizer's accepted-session view immediately useful.
	await db.prepare(
		`UPDATE submission_speakers SET name = ?, bio = ?
		 WHERE person_id = ? AND submission_id IN (SELECT id FROM submissions WHERE event_id = ?)`,
	).bind(displayName, bio || null, args.personId, args.eventId).run();
	return { ok: true, profile };
}

function optionalText(
	value: string | null | undefined,
	label: string,
	max: number,
): { ok: true; value: string | null } | { ok: false; error: string; status: number } {
	if (value == null) return { ok: true, value: null };
	if (typeof value !== "string") return { ok: false, error: `${label} must be a string`, status: 400 };
	const trimmed = value.trim();
	if (trimmed.length > max) return { ok: false, error: `${label} is too long (max ${max} characters)`, status: 400 };
	return { ok: true, value: trimmed || null };
}
