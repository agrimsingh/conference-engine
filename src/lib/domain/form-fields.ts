import type { VisibilityRule } from "./visibility";

export const FIELD_TYPES = [
	"text",
	"textarea",
	"select",
	"multiselect",
	"url",
	"email",
	"number",
	"speaker_block",
] as const;

export type FieldType = (typeof FIELD_TYPES)[number];

export type SelectOption = { value: string; label: string };

export type FieldConfig =
	| { kind: "text"; placeholder?: string; maxLength?: number }
	| { kind: "textarea"; placeholder?: string; maxLength?: number; rows?: number }
	| { kind: "select"; options: SelectOption[] }
	| { kind: "multiselect"; options: SelectOption[] }
	| { kind: "url"; placeholder?: string }
	| { kind: "email"; placeholder?: string }
	| { kind: "number"; min?: number; max?: number; step?: number }
	| { kind: "speaker_block"; minSpeakers?: number; maxSpeakers?: number };

export type FormFieldDef = {
	key: string;
	label: string;
	fieldType: FieldType;
	required: boolean;
	position: number;
	visibilityRule: VisibilityRule;
	config: FieldConfig;
	helpText?: string;
};

type FieldTypeMeta = {
	type: FieldType;
	defaultConfig: FieldConfig;
};

export const FIELD_TYPE_REGISTRY: Record<FieldType, FieldTypeMeta> = {
	text: { type: "text", defaultConfig: { kind: "text" } },
	textarea: { type: "textarea", defaultConfig: { kind: "textarea", rows: 5 } },
	select: { type: "select", defaultConfig: { kind: "select", options: [] } },
	multiselect: {
		type: "multiselect",
		defaultConfig: { kind: "multiselect", options: [] },
	},
	url: { type: "url", defaultConfig: { kind: "url" } },
	email: { type: "email", defaultConfig: { kind: "email" } },
	number: { type: "number", defaultConfig: { kind: "number" } },
	speaker_block: {
		type: "speaker_block",
		defaultConfig: { kind: "speaker_block", minSpeakers: 1, maxSpeakers: 4 },
	},
};

export function isFieldType(value: string): value is FieldType {
	return (FIELD_TYPES as readonly string[]).includes(value);
}

export function parseFieldConfig(fieldType: FieldType, raw: string): FieldConfig {
	const parsed: unknown = JSON.parse(raw);
	if (!isFieldConfig(parsed) || parsed.kind !== fieldType) {
		throw new Error(`Invalid config for field type ${fieldType}`);
	}
	return parsed;
}

export function isFieldConfig(value: unknown): value is FieldConfig {
	if (typeof value !== "object" || value === null || !("kind" in value)) {
		return false;
	}
	const kind = (value as { kind: unknown }).kind;
	return (FIELD_TYPES as readonly string[]).includes(kind as string);
}

export type SpeakerAnswer = {
	name: string;
	email: string;
	bio?: string;
};

export function validateFieldAnswer(
	field: FormFieldDef,
	answer: unknown,
): string | null {
	if (answer === undefined || answer === null || answer === "") {
		return field.required ? `${field.label} is required` : null;
	}

	switch (field.config.kind) {
		case "text":
		case "textarea":
		case "url":
		case "email": {
			if (typeof answer !== "string") return `${field.label} must be text`;
			if (
				(field.config.kind === "text" || field.config.kind === "textarea") &&
				field.config.maxLength !== undefined &&
				answer.length > field.config.maxLength
			) {
				return `${field.label} must be at most ${field.config.maxLength} characters`;
			}
			if (field.config.kind === "email" && !answer.includes("@")) {
				return `${field.label} must be a valid email`;
			}
			if (field.config.kind === "url") {
				try {
					new URL(answer);
				} catch {
					return `${field.label} must be a valid URL`;
				}
			}
			return null;
		}
		case "number": {
			if (typeof answer !== "number" || Number.isNaN(answer)) {
				return `${field.label} must be a number`;
			}
			if (field.config.min !== undefined && answer < field.config.min) {
				return `${field.label} must be ≥ ${field.config.min}`;
			}
			if (field.config.max !== undefined && answer > field.config.max) {
				return `${field.label} must be ≤ ${field.config.max}`;
			}
			return null;
		}
		case "select": {
			if (typeof answer !== "string") return `${field.label} must be a selection`;
			const ok = field.config.options.some((o) => o.value === answer);
			return ok ? null : `${field.label} has an invalid option`;
		}
		case "multiselect": {
			if (!Array.isArray(answer) || !answer.every((x) => typeof x === "string")) {
				return `${field.label} must be a list of options`;
			}
			const allowed = new Set(field.config.options.map((o) => o.value));
			for (const v of answer) {
				if (!allowed.has(v)) return `${field.label} has an invalid option`;
			}
			return null;
		}
		case "speaker_block": {
			if (!Array.isArray(answer)) return `${field.label} must be a speaker list`;
			const min = field.config.minSpeakers ?? 1;
			const max = field.config.maxSpeakers ?? 8;
			if (answer.length < min) return `Add at least ${min} speaker(s)`;
			if (answer.length > max) return `At most ${max} speaker(s) allowed`;
			for (const speaker of answer) {
				if (!isSpeakerAnswer(speaker)) {
					return "Each speaker needs name and email";
				}
			}
			return null;
		}
		default: {
			const _exhaustive: never = field.config;
			return _exhaustive;
		}
	}
}

function isSpeakerAnswer(value: unknown): value is SpeakerAnswer {
	if (typeof value !== "object" || value === null) return false;
	const v = value as { name?: unknown; email?: unknown };
	return (
		typeof v.name === "string" &&
		v.name.trim().length > 0 &&
		typeof v.email === "string" &&
		v.email.includes("@")
	);
}
