export type SettingsSectionId =
	| "details"
	| "team"
	| "api-tokens"
	| "rooms"
	| "tracks"
	| "tasks";

export function parseSection(value: string | null | undefined): SettingsSectionId {
	switch (value) {
		case "team":
		case "api-tokens":
		case "rooms":
		case "tracks":
		case "tasks":
		case "details":
			return value;
		default:
			return "details";
	}
}
