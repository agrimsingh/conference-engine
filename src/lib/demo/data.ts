export const DEMO_EVENT_SLUG = "demo-cfp-to-stage";

export type DemoPerspective =
	| "applicant"
	| "organizer"
	| "reviewer"
	| "speaker"
	| "attendee";

export const DEMO_PERSPECTIVES: Array<{
	id: DemoPerspective;
	label: string;
	description: string;
}> = [
	{ id: "applicant", label: "Applicant", description: "Interactive read-only CFP form." },
	{ id: "organizer", label: "Organizer", description: "Create your own event for admin." },
	{ id: "reviewer", label: "Reviewer", description: "Review boards need your event." },
	{ id: "speaker", label: "Speaker", description: "Portal needs a real invite." },
	{ id: "attendee", label: "Attendee", description: "Published schedule and speakers." },
];
