import { Suspense } from "react";
import { AdminEventNav } from "@/components/admin-event-nav";
import { PageHeader } from "@/components/page-header";
import { assertCanManageEvent, listAccessibleEvents } from "@/lib/auth/admin";
import { getDb } from "@/lib/db/cloudflare";
import { listCloneableSessionsForEvents, listSubmissionsForEvent } from "@/lib/db/queries";
import { SessionWorkbench } from "./session-workbench";

function titleFromAnswers(raw: string): string {
	try {
		const parsed: unknown = JSON.parse(raw);
		if (
			typeof parsed === "object" &&
			parsed !== null &&
			!Array.isArray(parsed) &&
			typeof (parsed as Record<string, unknown>).title === "string"
		) {
			return (parsed as Record<string, string>).title.trim() || "Untitled session";
		}
	} catch {
		/* fall through */
	}
	return "Untitled session";
}

export default async function SessionsPage({ params }: { params: Promise<{ eventSlug: string }> }) {
	const { eventSlug } = await params;
	const db = await getDb();
	const { event } = await assertCanManageEvent(db, eventSlug);
	const [{ events: accessible }, submissions, slots] = await Promise.all([
		listAccessibleEvents(db),
		listSubmissionsForEvent(db, event.id),
		db.prepare("SELECT submission_id FROM agenda_slots WHERE event_id = ?").bind(event.id).all<{ submission_id: string }>(),
	]);
	const accessibleIds = accessible.length > 0 ? accessible.map((row) => row.id) : [event.id];
	const cloneable = await listCloneableSessionsForEvents(db, accessibleIds);
	const placed = new Set(slots.results.map((slot) => slot.submission_id));
	const sessions = submissions
		.filter((submission) => submission.origin && submission.origin !== "cfp")
		.map((submission) => ({
			id: submission.id,
			title: titleFromAnswers(submission.answers_json),
			speaker: submission.submitter_name,
			status: submission.status,
			origin: submission.origin!,
			hasSlot: placed.has(submission.id),
			lineageParentId: submission.lineage_parent_submission_id ?? null,
		}));
	const cloneSources = cloneable.map((row) => ({
		id: row.id,
		title: titleFromAnswers(row.answers_json),
		eventName: row.event_name,
		eventSlug: row.event_slug,
		status: row.status,
		speaker: row.submitter_name,
	}));
	return (
		<div className="min-h-dvh bg-neutral-950 text-neutral-200">
			<AdminEventNav eventSlug={event.slug} />
			<main className="mx-auto max-w-6xl px-4 py-10">
				<PageHeader
					eyebrow="Organizer · Sessions"
					title={event.name}
					description="Create booked sessions, import a program safely, carry content between events, and publish only placed sessions."
				/>
				<Suspense
					fallback={<p className="mt-8 text-sm text-neutral-500">Loading sessions…</p>}
				>
					<SessionWorkbench
						eventSlug={event.slug}
						sessions={sessions}
						cloneSources={cloneSources}
					/>
				</Suspense>
			</main>
		</div>
	);
}
