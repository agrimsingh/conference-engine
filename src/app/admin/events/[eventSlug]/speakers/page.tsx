import { Suspense } from "react";
import { AdminEventNav } from "@/components/admin-event-nav";
import { PageHeader } from "@/components/page-header";
import { assertCanManageEvent } from "@/lib/auth/admin";
import { sessionContentFromRow } from "@/lib/content/revisions";
import { getDb } from "@/lib/db/cloudflare";
import type { ContentRevisionRow, SubmissionRow } from "@/lib/db/types";
import { listEventSpeakerRoster } from "@/lib/speakers/roster";
import { listSpeakerCrmOwners } from "@/lib/speakers/crm";
import type { ContentSession, ContentSpeaker } from "../content/content-console";
import { SpeakerRoster } from "./speaker-roster";

type Props = {
	params: Promise<{ eventSlug: string }>;
	searchParams: Promise<{ status?: string; q?: string; panel?: string }>;
};

function parseSnapshot(row: ContentRevisionRow): Record<string, unknown> {
	try {
		return JSON.parse(row.snapshot_json) as Record<string, unknown>;
	} catch {
		return {};
	}
}

async function loadContentData(db: Awaited<ReturnType<typeof getDb>>, eventId: string) {
	const [submissions, revisions, speakerRows, speakerRevisions] = await Promise.all([
		db
			.prepare(
				`SELECT s.*, CASE WHEN h.approved_revision_id IS NULL THEN 0 ELSE 1 END AS has_approved_snapshot
				 FROM submissions s
				 LEFT JOIN content_heads h ON h.event_id = s.event_id AND h.entity_type = 'session' AND h.entity_id = s.id
				 WHERE s.event_id = ? AND s.status IN ('accepted','scheduled','published')
				 ORDER BY s.updated_at DESC`,
			)
			.bind(eventId)
			.all<SubmissionRow & { has_approved_snapshot: number }>(),
		db
			.prepare(
				"SELECT * FROM content_revisions WHERE event_id = ? AND entity_type = 'session' ORDER BY created_at DESC",
			)
			.bind(eventId)
			.all<ContentRevisionRow>(),
		db
			.prepare(
				`SELECT DISTINCT p.id AS person_id, COALESCE(sp.display_name, p.name, p.email) AS name, p.email,
				 COALESCE(sp.bio, '') AS bio, CASE WHEN sp.headshot_asset_id IS NULL THEN 0 ELSE 1 END AS has_headshot
				 FROM people p
				 INNER JOIN submission_speakers ss ON ss.person_id = p.id
				 INNER JOIN submissions s ON s.id = ss.submission_id AND s.event_id = ?
				 LEFT JOIN speaker_profiles sp ON sp.event_id = s.event_id AND sp.person_id = p.id
				 WHERE s.status IN ('accepted','scheduled','published') AND ss.status IN ('pending','confirmed')
				 ORDER BY name`,
			)
			.bind(eventId)
			.all<{
				person_id: string;
				name: string;
				email: string;
				bio: string;
				has_headshot: number;
			}>(),
		db
			.prepare(
				"SELECT * FROM content_revisions WHERE event_id = ? AND entity_type = 'speaker' ORDER BY created_at DESC",
			)
			.bind(eventId)
			.all<ContentRevisionRow>(),
	]);

	const shapeRevision = (row: ContentRevisionRow) => ({
		id: row.id,
		number: row.revision_number,
		editorName: row.editor_name,
		createdAt: row.created_at,
		snapshot: parseSnapshot(row),
		restoredFrom: row.restored_from_revision_id,
	});

	const sessions: ContentSession[] = submissions.results.map((row) => ({
		id: row.id,
		...sessionContentFromRow(row),
		status: row.status,
		hasApprovedSnapshot: row.has_approved_snapshot === 1,
		revisions: revisions.results
			.filter((revision) => revision.entity_id === row.id)
			.map(shapeRevision),
	}));

	const speakers: ContentSpeaker[] = speakerRows.results.map((row) => ({
		personId: row.person_id,
		name: row.name,
		email: row.email,
		bio: row.bio,
		hasHeadshot: row.has_headshot === 1,
		revisions: speakerRevisions.results
			.filter((revision) => revision.entity_id === row.person_id)
			.map(shapeRevision),
	}));

	return { sessions, speakers };
}

export default async function AdminSpeakersPage({ params, searchParams }: Props) {
	const { eventSlug } = await params;
	const query = await searchParams;
	const db = await getDb();
	const { event } = await assertCanManageEvent(db, eventSlug);
	const [speakers, crmOwners, content] = await Promise.all([
		listEventSpeakerRoster(db, event.id),
		listSpeakerCrmOwners(db, event.id),
		loadContentData(db, event.id),
	]);
	const initialStatus =
		query.status === "invited"
		|| query.status === "confirmed"
		|| query.status === "declined"
		|| query.status === "withdrawn"
			? query.status
			: "all";

	return (
		<div className="min-h-dvh bg-neutral-950 text-neutral-200">
			<AdminEventNav eventSlug={event.slug} />
			<main className="mx-auto max-w-6xl px-4 py-10">
				<PageHeader
					eyebrow="Organizer · Speakers"
					title={event.name}
					description="Roster, session and speaker copy, CRM, and bulk email — event-scoped speaker operations in one workspace."
				/>
				<Suspense
					fallback={
						<p className="mt-8 text-sm text-neutral-500">Loading speakers…</p>
					}
				>
					<SpeakerRoster
						eventSlug={event.slug}
						initialSpeakers={speakers}
						initialStatus={initialStatus}
						initialQuery={query.q ?? ""}
						eventName={event.name}
						crmOwners={crmOwners}
						contentSessions={content.sessions}
						contentSpeakers={content.speakers}
					/>
				</Suspense>
			</main>
		</div>
	);
}
