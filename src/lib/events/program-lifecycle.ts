export type ProgramLifecycleStepKey =
	| "library"
	| "open_cfp"
	| "evaluation"
	| "finalize_notify"
	| "speaker_onboarding"
	| "prepare_agenda"
	| "publish";

export type ProgramLifecycleStatus = "completed" | "current" | "blocked";

export type ProgramLifecycleInput = {
	eventSlug: string;
	roomsCount: number;
	tracksCount: number;
	formsReady: boolean;
	cfpOpen: boolean;
	submittedCount: number;
	reviewPlanReady: boolean;
	needsReviewActivation: number;
	unassignedReviews: number;
	incompleteReviews: number;
	reviewedUndecided: number;
	toNotifyRemaining: number;
	pendingReviewCount: number;
	acceptedCount: number;
	outstandingSpeakerTasks: number;
	acceptedUnscheduled: number;
	scheduledUnpublished: number;
	publishedCount: number;
};

export type ProgramLifecycleStep = {
	key: ProgramLifecycleStepKey;
	label: string;
	detail: string;
	status: ProgramLifecycleStatus;
	href: string;
	cta: string;
};

type StepDefinition = {
	key: ProgramLifecycleStepKey;
	label: string;
	complete: (input: ProgramLifecycleInput) => boolean;
	detail: (input: ProgramLifecycleInput) => string;
	href: (eventSlug: string) => string;
	cta: (input: ProgramLifecycleInput) => string;
};

function base(eventSlug: string): string {
	return `/admin/events/${eventSlug}`;
}

function plural(count: number, singular: string, pluralForm = `${singular}s`): string {
	return `${count} ${count === 1 ? singular : pluralForm}`;
}

const STEP_DEFINITIONS: readonly StepDefinition[] = [
	{
		key: "library",
		label: "Library & forms",
		complete: (input) =>
			input.roomsCount > 0 && input.tracksCount > 0 && input.formsReady,
		detail: (input) => {
			if (input.roomsCount > 0 && input.tracksCount > 0 && input.formsReady) {
				return `${plural(input.roomsCount, "room")}, ${plural(input.tracksCount, "track")}, and a public form are ready.`;
			}
			const missing: string[] = [];
			if (input.roomsCount === 0) missing.push("rooms");
			if (input.tracksCount === 0) missing.push("tracks");
			if (!input.formsReady) missing.push("a public form with fields");
			return `Add ${missing.join(", ")} before opening collection.`;
		},
		href: (slug) => `${base(slug)}/setup`,
		cta: () => "Configure library",
	},
	{
		key: "open_cfp",
		label: "Open CFP",
		complete: (input) => input.cfpOpen || input.submittedCount > 0,
		detail: (input) => {
			if (input.submittedCount > 0) {
				return `${plural(input.submittedCount, "proposal")} collected${input.cfpOpen ? "; the CFP is still open" : "; collection is closed"}.`;
			}
			if (input.cfpOpen) {
				return "The CFP is open. Share it and collect the first proposal.";
			}
			return "Open the public form so speakers can submit.";
		},
		href: (slug) => `${base(slug)}/forms`,
		cta: (input) => (input.cfpOpen ? "Manage CFP" : "Open CFP"),
	},
	{
		key: "evaluation",
		label: "Evaluation & review",
		complete: (input) =>
			input.reviewPlanReady &&
			input.submittedCount > 0 &&
			input.needsReviewActivation === 0 &&
			input.unassignedReviews === 0 &&
			input.incompleteReviews === 0,
		detail: (input) => {
			if (input.submittedCount === 0) {
				return "Evaluation starts after the first submitted proposal.";
			}
			if (!input.reviewPlanReady) {
				return "Create a review plan with criteria before assigning reviewers.";
			}
			if (input.needsReviewActivation > 0) {
				return `${plural(input.needsReviewActivation, "proposal")} waiting for an active review plan.`;
			}
			if (input.unassignedReviews > 0 || input.incompleteReviews > 0) {
				return `${plural(input.unassignedReviews, "unassigned review")}, ${plural(input.incompleteReviews, "incomplete review")}.`;
			}
			return "Assigned reviews are complete.";
		},
		href: (slug) => `${base(slug)}/review`,
		cta: () => "Open review",
	},
	{
		key: "finalize_notify",
		label: "Finalize & notify",
		complete: (input) =>
			input.submittedCount > 0 &&
			input.pendingReviewCount === 0 &&
			input.reviewedUndecided === 0 &&
			input.toNotifyRemaining === 0,
		detail: (input) => {
			if (input.submittedCount === 0) {
				return "No submitted proposals are ready for a decision.";
			}
			if (
				input.pendingReviewCount === 0 &&
				input.reviewedUndecided === 0 &&
				input.toNotifyRemaining === 0
			) {
				return "Decisions are finalized and speakers have been notified.";
			}
			const parts: string[] = [];
			if (input.pendingReviewCount > 0) {
				parts.push(`${plural(input.pendingReviewCount, "proposal")} still in review`);
			}
			if (input.reviewedUndecided > 0) {
				parts.push(`${plural(input.reviewedUndecided, "reviewed proposal")} undecided`);
			}
			if (input.toNotifyRemaining > 0) {
				parts.push(`${plural(input.toNotifyRemaining, "decision")} waiting to notify`);
			}
			return `${parts.join("; ")}.`;
		},
		href: (slug) => `${base(slug)}/submissions?queue=to_notify`,
		cta: (input) =>
			input.toNotifyRemaining > 0 ? "Review and notify" : "Open submissions",
	},
	{
		key: "speaker_onboarding",
		label: "Speaker onboarding",
		complete: (input) =>
			input.acceptedCount === 0 || input.outstandingSpeakerTasks === 0,
		detail: (input) => {
			if (input.acceptedCount === 0) {
				return "Speaker tasks start after at least one proposal is accepted.";
			}
			if (input.outstandingSpeakerTasks === 0) {
				return `${plural(input.acceptedCount, "accepted session")} — required speaker tasks are complete.`;
			}
			return `${plural(input.outstandingSpeakerTasks, "required speaker task")} outstanding.`;
		},
		href: (slug) => `${base(slug)}/speakers`,
		cta: () => "Track speaker tasks",
	},
	{
		key: "prepare_agenda",
		label: "Prepare agenda",
		complete: (input) =>
			input.acceptedCount === 0 || input.acceptedUnscheduled === 0,
		detail: (input) => {
			if (input.acceptedCount === 0) {
				return "The agenda needs accepted sessions.";
			}
			if (input.acceptedUnscheduled === 0) {
				return `${plural(input.acceptedCount, "accepted session")} placed on the schedule.`;
			}
			return `${plural(input.acceptedUnscheduled, "accepted session")} still need a slot.`;
		},
		href: (slug) => `${base(slug)}/schedule`,
		cta: () => "Prepare agenda",
	},
	{
		key: "publish",
		label: "Publish",
		complete: (input) =>
			input.scheduledUnpublished === 0 &&
			(input.acceptedCount === 0 || input.publishedCount > 0),
		detail: (input) => {
			if (input.acceptedCount === 0) {
				return "Nothing to publish until sessions are accepted and scheduled.";
			}
			if (input.scheduledUnpublished === 0 && input.publishedCount > 0) {
				return `${plural(input.publishedCount, "session")} live on the public schedule.`;
			}
			if (input.scheduledUnpublished > 0) {
				return `${plural(input.scheduledUnpublished, "scheduled session")} still unpublished — publish when ready.`;
			}
			return "Publish scheduled sessions so they appear on the public schedule.";
		},
		href: (slug) => `${base(slug)}/schedule`,
		cta: () => "Review publication",
	},
];

export function programLifecycle(input: ProgramLifecycleInput): ProgramLifecycleStep[] {
	const completes = STEP_DEFINITIONS.map((step) => step.complete(input));
	const firstIncomplete = completes.findIndex((complete) => !complete);

	return STEP_DEFINITIONS.map((step, index) => {
		let status: ProgramLifecycleStatus;
		if (firstIncomplete === -1) {
			status = "completed";
		} else if (index < firstIncomplete) {
			status = "completed";
		} else if (index === firstIncomplete) {
			status = "current";
		} else {
			status = "blocked";
		}

		return {
			key: step.key,
			label: step.label,
			detail: step.detail(input),
			status,
			href: step.href(input.eventSlug),
			cta: step.cta(input),
		};
	});
}

export function programLifecycleCurrent(
	steps: readonly ProgramLifecycleStep[],
): ProgramLifecycleStep | null {
	return steps.find((step) => step.status === "current") ?? null;
}
