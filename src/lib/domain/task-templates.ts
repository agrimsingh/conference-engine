export type DefaultTaskTemplate = {
	key: string;
	label: string;
	taskKind: "text" | "file";
	required: boolean;
	position: number;
};

/**
 * The baseline inserted for every event. D1 rows become authoritative after
 * creation, so materialization always reads its event's active templates.
 */
export const DEFAULT_TASK_TEMPLATES: readonly DefaultTaskTemplate[] = [
	{ key: "bio", label: "Speaker bio", taskKind: "text", required: true, position: 0 },
	{ key: "headshot", label: "Headshot", taskKind: "file", required: true, position: 1 },
	{ key: "slides", label: "Slides", taskKind: "file", required: true, position: 2 },
	{ key: "docs", label: "Supporting docs", taskKind: "file", required: true, position: 3 },
];
