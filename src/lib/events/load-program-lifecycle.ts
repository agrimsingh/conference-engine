import { loadCockpitSnapshot } from "@/lib/cockpit/snapshot";
import {
	getSubmissionFacetCounts,
	getSubmissionQueueCounts,
} from "@/lib/db/queries";
import type { EventRow } from "@/lib/db/types";
import { loadEventConfiguration } from "./configuration";
import {
	programLifecycle,
	type ProgramLifecycleInput,
	type ProgramLifecycleStep,
} from "./program-lifecycle";

function statusCount(
	byStatus: ReadonlyArray<{ value: string; count: number }>,
	status: string,
): number {
	return byStatus.find((row) => row.value === status)?.count ?? 0;
}

export async function loadProgramLifecycleInput(
	db: D1Database,
	event: EventRow,
	cockpit?: Awaited<ReturnType<typeof loadCockpitSnapshot>>,
): Promise<ProgramLifecycleInput> {
	const snapshot = cockpit ?? (await loadCockpitSnapshot(db, event));
	const [configuration, queues, facets] = await Promise.all([
		loadEventConfiguration(db, event.id),
		getSubmissionQueueCounts(db, event.id),
		getSubmissionFacetCounts(db, event.id),
	]);

	const draftCount = statusCount(facets.byStatus, "draft");
	const withdrawnCount = statusCount(facets.byStatus, "withdrawn");
	const accepted = statusCount(facets.byStatus, "accepted");
	const scheduled = statusCount(facets.byStatus, "scheduled");
	const published = statusCount(facets.byStatus, "published");

	return {
		eventSlug: event.slug,
		roomsCount: configuration.rooms.length,
		tracksCount: configuration.tracks.length,
		formsReady: Boolean(
			configuration.cfp &&
				configuration.cfp.title.trim() &&
				configuration.cfp.fieldCount > 0,
		),
		cfpOpen: configuration.cfp?.status === "open",
		submittedCount: Math.max(0, facets.total - draftCount - withdrawnCount),
		reviewPlanReady: Boolean(
			configuration.review && configuration.review.criteriaCount > 0,
		),
		needsReviewActivation: snapshot.needsReviewActivationTotal,
		unassignedReviews: snapshot.unassignedReviewsTotal,
		incompleteReviews: snapshot.incompleteReviewsTotal,
		reviewedUndecided: snapshot.reviewedUndecidedTotal,
		toNotifyRemaining: queues.to_notify,
		pendingReviewCount: queues.pending,
		acceptedCount: accepted + scheduled + published,
		outstandingSpeakerTasks: snapshot.outstandingTasks.incompleteCount,
		acceptedUnscheduled: snapshot.acceptedUnscheduledTotal,
		scheduledUnpublished: snapshot.scheduledUnpublishedTotal,
		publishedCount: published,
	};
}

export async function loadProgramLifecycle(
	db: D1Database,
	event: EventRow,
	cockpit?: Awaited<ReturnType<typeof loadCockpitSnapshot>>,
): Promise<ProgramLifecycleStep[]> {
	return programLifecycle(await loadProgramLifecycleInput(db, event, cockpit));
}
