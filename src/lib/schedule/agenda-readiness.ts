import {
	detectConflicts,
	isPublicAgendaVisibility,
	type ScheduleInterval,
} from "@/lib/domain/schedule";

export type AgendaReadinessSession = {
	id: string;
	status: string;
	contentStatus?: string | null;
	agendaVisibility?: string | null;
	speakerKeys: readonly string[];
	slot: {
		roomId: string | null;
		roomName: string;
		startsAtMs: number;
		endsAtMs: number;
	} | null;
};

export type AgendaReadinessStepKey =
	| "accepted"
	| "public_approval"
	| "scheduled"
	| "conflicts"
	| "published";

export type AgendaReadinessStep = {
	key: AgendaReadinessStepKey;
	label: string;
	count: number;
	href?: string;
	complete: boolean;
};

const PROGRAMME_STATUSES = new Set(["accepted", "scheduled", "published"]);

export function isProgrammeSession(session: Pick<AgendaReadinessSession, "status">): boolean {
	return PROGRAMME_STATUSES.has(session.status);
}

export function isContentApproved(
	session: Pick<AgendaReadinessSession, "contentStatus">,
): boolean {
	return session.contentStatus === "approved";
}

export function isScheduledOnAgenda(
	session: Pick<AgendaReadinessSession, "slot">,
): boolean {
	return session.slot != null;
}

function toInterval(session: AgendaReadinessSession): ScheduleInterval | null {
	if (!session.slot) return null;
	return {
		submissionId: session.id,
		roomId: session.slot.roomId,
		roomName: session.slot.roomName,
		startsAtMs: session.slot.startsAtMs,
		endsAtMs: session.slot.endsAtMs,
		speakerKeys: session.speakerKeys,
	};
}

export function countConflictedSessions(
	sessions: readonly AgendaReadinessSession[],
): number {
	const placed = sessions
		.map(toInterval)
		.filter((interval): interval is ScheduleInterval => interval != null);
	const conflicted = new Set<string>();
	for (const candidate of placed) {
		const others = placed.filter((row) => row.submissionId !== candidate.submissionId);
		if (detectConflicts(candidate, others).length === 0) continue;
		conflicted.add(candidate.submissionId);
	}
	return conflicted.size;
}

export function buildAgendaReadiness(
	sessions: readonly AgendaReadinessSession[],
	options: { eventSlug: string },
): AgendaReadinessStep[] {
	const programme = sessions.filter(
		(session) => isProgrammeSession(session) && session.status !== "withdrawn",
	);
	const publicProgramme = programme.filter((session) =>
		isPublicAgendaVisibility(session.agendaVisibility),
	);
	const acceptedCount = programme.length;
	const publicCount = publicProgramme.length;
	const approvedCount = publicProgramme.filter(isContentApproved).length;
	const scheduledCount = programme.filter(isScheduledOnAgenda).length;
	const conflictCount = countConflictedSessions(programme);
	const publishedCount = publicProgramme.filter((session) => session.status === "published").length;

	const base = `/admin/events/${options.eventSlug}`;
	const hasProgramme = acceptedCount > 0;
	const publicApprovalComplete =
		hasProgramme && (publicCount === 0 || approvedCount === publicCount);
	const publishedComplete =
		hasProgramme && (publicCount === 0 || publishedCount === publicCount);

	return [
		{
			key: "accepted",
			label: "Accepted",
			count: acceptedCount,
			href: `${base}/submissions?status=accepted`,
			complete: hasProgramme,
		},
		{
			key: "public_approval",
			label: "Public approval",
			count: approvedCount,
			href: `${base}/content`,
			complete: publicApprovalComplete,
		},
		{
			key: "scheduled",
			label: "Scheduled",
			count: scheduledCount,
			href: "#unplaced",
			complete: hasProgramme && scheduledCount === acceptedCount,
		},
		{
			key: "conflicts",
			label: "Conflicts",
			count: conflictCount,
			href: "#conflicts",
			complete: conflictCount === 0,
		},
		{
			key: "published",
			label: "Published",
			count: publishedCount,
			href: "#publish",
			complete: publishedComplete,
		},
	];
}
