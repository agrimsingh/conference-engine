/**
 * Route-family audit seam for event-scoped admin writes. Each family must call
 * `authorizeWritableEventAdminApi` after tenant authorization and before any
 * D1, R2, email, Durable Object, or external-provider side effect.
 */
export const ADMIN_EVENT_MUTATION_FAMILIES = [
	"claim",
	"evaluation.activate",
	"export.airtable",
	"forms.metadata",
	"forms.fields",
	"members.invite-remove-leave-transfer",
	"reminders",
	"reviewers",
	"schedule",
	"sessions.create-import-clone-publish",
	"settings.rooms-tracks-tasks-event",
	"submissions.assignments-decisions-labels-speakers",
] as const;
