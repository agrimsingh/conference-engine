/**
 * Co-speaker lifecycle.
 *
 * Product rules (see PRODUCT.md): co-speakers are listed immediately with an
 * explicit status — never hidden, never silently expired. Confirmation proves
 * a real person is behind the name; organizers keep final authority.
 */

export const CO_SPEAKER_STATUSES = [
	"pending",
	"confirmed",
	"declined",
	"removed",
] as const;

export type CoSpeakerStatus = (typeof CO_SPEAKER_STATUSES)[number];

export function isCoSpeakerStatus(value: string): value is CoSpeakerStatus {
	return (CO_SPEAKER_STATUSES as readonly string[]).includes(value);
}

/** Max co-speakers per submission, excluding the primary submitter. */
export const MAX_CO_SPEAKERS = 3;

/** Statuses in which a submission counts as accepted for task spawning. */
export const POST_ACCEPTANCE_STATUSES = [
	"accepted",
	"scheduled",
	"published",
] as const;

export function isPostAcceptance(status: string): boolean {
	return (POST_ACCEPTANCE_STATUSES as readonly string[]).includes(status);
}

/** Role shown on CFP, portal, organizer submission, and review results. */
export function speakerRoleLabel(position: number): string {
	return position === 0 ? "Primary speaker" : "Co-author";
}
