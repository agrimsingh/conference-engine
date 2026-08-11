export type FormBuilderSectionId =
	| "settings"
	| "sections"
	| "fields"
	| "add-field";

export function parseFormBuilderSection(
	value: string | null | undefined,
): FormBuilderSectionId {
	switch (value) {
		case "sections":
		case "fields":
		case "add-field":
		case "settings":
			return value;
		default:
			return "settings";
	}
}
