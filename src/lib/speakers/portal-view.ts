import {
	isSpeakerTaskKey,
	type SubmissionStatus,
} from "@/lib/domain";

/** Bio/headshot belong on Profile — not session prep. */
export const PROFILE_TASK_KEYS = new Set(["bio", "headshot"]);

export function isProfileTaskKey(key: string): boolean {
	return PROFILE_TASK_KEYS.has(key);
}

/** Slides/docs and custom organizer file/text tasks stay under Prep. */
export function isSessionPrepTaskKey(key: string): boolean {
	if (isProfileTaskKey(key)) return false;
	if (isSpeakerTaskKey(key)) return key === "slides" || key === "docs";
	return true;
}

export type SpeakerApplicationStatusLabel =
	| "Draft"
	| "Submitted"
	| "In review"
	| "Accepted"
	| "Declined"
	| "Waitlisted"
	| "Scheduled"
	| "On the program"
	| "Withdrawn";

export function speakerApplicationStatusLabel(
	status: SubmissionStatus | string,
): SpeakerApplicationStatusLabel {
	switch (status) {
		case "draft":
			return "Draft";
		case "submitted":
			return "Submitted";
		case "under_review":
			return "In review";
		case "accepted":
			return "Accepted";
		case "rejected":
			return "Declined";
		case "waitlisted":
			return "Waitlisted";
		case "scheduled":
			return "Scheduled";
		case "published":
			return "On the program";
		case "withdrawn":
			return "Withdrawn";
		default:
			return "Submitted";
	}
}

export function isAcceptedProgrammeStatus(status: string): boolean {
	return (
		status === "accepted" || status === "scheduled" || status === "published"
	);
}
