export type EmptyNextActionTarget =
	| "settings.rooms"
	| "settings.tracks"
	| "settings.tasks"
	| "forms"
	| "submissions"
	| "speakers.add"
	| "resources.create"
	| "tasks.deliverables";

export function emptyNextActionHref(
	eventSlug: string,
	target: EmptyNextActionTarget,
): string {
	const base = `/admin/events/${eventSlug}`;
	switch (target) {
		case "settings.rooms":
			return `${base}/settings?section=rooms`;
		case "settings.tracks":
			return `${base}/settings?section=tracks`;
		case "settings.tasks":
			return `${base}/settings?section=tasks`;
		case "forms":
			return `${base}/forms`;
		case "submissions":
			return `${base}/submissions`;
		case "speakers.add":
			return `${base}/speakers?panel=add`;
		case "resources.create":
			return `${base}/resources?section=create`;
		case "tasks.deliverables":
			return `${base}/tasks?section=deliverables`;
		default: {
			const _exhaustive: never = target;
			return _exhaustive;
		}
	}
}
