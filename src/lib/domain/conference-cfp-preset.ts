import type { FormFieldDef } from "./form-fields";
import type { VisibilityRule } from "./visibility";

const FORMAT_EQ = (value: string): VisibilityRule => ({
	op: "eq",
	fieldKey: "format",
	value,
});

const FORMAT_IN = (values: string[]): VisibilityRule => ({
	op: "in",
	fieldKey: "format",
	values,
});

export type ConferenceCfpPreset = {
	formSlug: string;
	title: string;
	description: string;
	fields: FormFieldDef[];
};

export function createConferenceCfpPreset(): ConferenceCfpPreset {
	const fields: FormFieldDef[] = [
		{
			key: "format",
			label: "Session format",
			fieldType: "select",
			required: true,
			position: 0,
			visibilityRule: { op: "always" },
			config: {
				kind: "select",
				options: [
					{ value: "stage", label: "Stage talk" },
					{ value: "lightning", label: "Lightning talk" },
					{ value: "workshop", label: "Workshop" },
					{ value: "online", label: "Online session" },
				],
			},
			helpText: "Pick the format. Extra fields appear based on your choice.",
		},
		{
			key: "title",
			label: "Title",
			fieldType: "text",
			required: true,
			position: 1,
			visibilityRule: { op: "always" },
			config: { kind: "text", maxLength: 160, placeholder: "Your session title" },
		},
		{
			key: "abstract",
			label: "Abstract",
			fieldType: "textarea",
			required: true,
			position: 2,
			visibilityRule: { op: "always" },
			config: {
				kind: "textarea",
				rows: 6,
				maxLength: 4000,
				placeholder: "What will attendees learn?",
			},
		},
		{
			key: "duration_minutes",
			label: "Duration (minutes)",
			fieldType: "number",
			required: true,
			position: 3,
			visibilityRule: FORMAT_IN(["stage", "workshop", "online"]),
			config: { kind: "number", min: 15, max: 240, step: 5 },
			helpText: "Stage default 30–45. Workshop often 90–180. Hidden for lightning.",
		},
		{
			key: "lightning_hook",
			label: "Lightning hook (one sentence)",
			fieldType: "text",
			required: true,
			position: 4,
			visibilityRule: FORMAT_EQ("lightning"),
			config: {
				kind: "text",
				maxLength: 200,
				placeholder: "The one idea you'll land in 5–8 minutes",
			},
		},
		{
			key: "workshop_capacity",
			label: "Workshop capacity",
			fieldType: "number",
			required: true,
			position: 5,
			visibilityRule: FORMAT_EQ("workshop"),
			config: { kind: "number", min: 8, max: 200, step: 1 },
		},
		{
			key: "workshop_prereqs",
			label: "Workshop prerequisites",
			fieldType: "textarea",
			required: false,
			position: 6,
			visibilityRule: FORMAT_EQ("workshop"),
			config: {
				kind: "textarea",
				rows: 3,
				placeholder: "Laptop? Account signup? Prior experience?",
			},
		},
		{
			key: "online_platform",
			label: "Online platform",
			fieldType: "select",
			required: true,
			position: 7,
			visibilityRule: FORMAT_EQ("online"),
			config: {
				kind: "select",
				options: [
					{ value: "zoom", label: "Zoom" },
					{ value: "meet", label: "Google Meet" },
					{ value: "youtube", label: "YouTube Live" },
					{ value: "other", label: "Other" },
				],
			},
		},
		{
			key: "speakers",
			label: "Speakers",
			fieldType: "speaker_block",
			required: true,
			position: 8,
			visibilityRule: { op: "always" },
			config: { kind: "speaker_block", minSpeakers: 1, maxSpeakers: 4 },
		},
	];

	return {
		formSlug: "cfp",
		title: "Call for proposals",
		description:
			"Submit a Stage, Lightning, Workshop, or Online session. Fields adapt to your format.",
		fields,
	};
}
