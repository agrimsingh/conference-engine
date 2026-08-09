import type { VisibilityRule } from "./visibility";

export const FIELD_TYPES = [
	"text",
	"textarea",
	"select",
	"multiselect",
	"url",
	"video",
	"email",
	"number",
	"speaker_block",
	"file_upload",
] as const;

export type FieldType = (typeof FIELD_TYPES)[number];

export type SelectOption = { value: string; label: string };

export type FieldConfig =
	| { kind: "text"; placeholder?: string; maxLength?: number }
	| { kind: "textarea"; placeholder?: string; maxLength?: number; rows?: number }
	| { kind: "select"; options: SelectOption[] }
	| { kind: "multiselect"; options: SelectOption[] }
	| { kind: "url"; placeholder?: string }
	| { kind: "video"; placeholder?: string }
	| { kind: "email"; placeholder?: string }
	| { kind: "number"; min?: number; max?: number; step?: number }
	| { kind: "speaker_block"; minSpeakers?: number; maxSpeakers?: number }
	| { kind: "file_upload"; accept?: string[]; maxBytes?: number };

export type FileUploadAnswer = {
	assetId: string;
	filename: string;
	contentType?: string;
};

export type FormFieldDef = {
	key: string;
	label: string;
	fieldType: FieldType;
	required: boolean;
	position: number;
	visibilityRule: VisibilityRule;
	config: FieldConfig;
	helpText?: string;
	sectionKey?: string | null;
};

type FieldTypeMeta = {
	type: FieldType;
	defaultConfig: FieldConfig;
};

export const FIELD_TYPE_REGISTRY: Record<FieldType, FieldTypeMeta> = {
	text: { type: "text", defaultConfig: { kind: "text" } },
	textarea: { type: "textarea", defaultConfig: { kind: "textarea", rows: 5 } },
	select: { type: "select", defaultConfig: { kind: "select", options: [{ value: "option_a", label: "Option A" }] } },
	multiselect: {
		type: "multiselect",
		defaultConfig: { kind: "multiselect", options: [{ value: "option_a", label: "Option A" }] },
	},
	url: { type: "url", defaultConfig: { kind: "url" } },
	video: { type: "video", defaultConfig: { kind: "video", placeholder: "https://…" } },
	email: { type: "email", defaultConfig: { kind: "email" } },
	number: { type: "number", defaultConfig: { kind: "number" } },
	speaker_block: {
		type: "speaker_block",
		defaultConfig: { kind: "speaker_block", minSpeakers: 1, maxSpeakers: 4 },
	},
	file_upload: {
		type: "file_upload",
		defaultConfig: { kind: "file_upload", maxBytes: 10 * 1024 * 1024 },
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
	const config = value as Record<string, unknown>;
	const optionalText = (key: string) => config[key] === undefined || typeof config[key] === "string";
	const optionalInt = (key: string, minimum = 0) => config[key] === undefined || (Number.isInteger(config[key]) && (config[key] as number) >= minimum);
	switch (config.kind) {
		case "text":
			return optionalText("placeholder") && optionalInt("maxLength", 1);
		case "textarea":
			return optionalText("placeholder") && optionalInt("maxLength", 1) && optionalInt("rows", 1);
		case "url":
		case "video":
		case "email":
			return optionalText("placeholder");
		case "number": {
			const min = config.min;
			const max = config.max;
			const step = config.step;
			return (min === undefined || typeof min === "number" && Number.isFinite(min))
				&& (max === undefined || typeof max === "number" && Number.isFinite(max))
				&& (step === undefined || typeof step === "number" && Number.isFinite(step) && step > 0)
				&& !(typeof min === "number" && typeof max === "number" && min > max);
		}
		case "select":
		case "multiselect":
			return isSelectOptions(config.options);
		case "speaker_block": {
			const min = config.minSpeakers;
			const max = config.maxSpeakers;
			return (min === undefined || Number.isInteger(min) && (min as number) >= 1)
				&& (max === undefined || Number.isInteger(max) && (max as number) >= 1)
				&& !(typeof min === "number" && typeof max === "number" && min > max);
		}
		case "file_upload": {
			const accept = config.accept;
			const maxBytes = config.maxBytes;
			return (accept === undefined || (Array.isArray(accept) && accept.every((item) => typeof item === "string" && item.trim())))
				&& (maxBytes === undefined || Number.isInteger(maxBytes) && (maxBytes as number) >= 1);
		}
		default:
			return false;
	}
}

function isSelectOptions(value: unknown): value is SelectOption[] {
	if (!Array.isArray(value) || value.length === 0) return false;
	const seen = new Set<string>();
	return value.every((option) => {
		if (typeof option !== "object" || option === null) return false;
		const { value: optionValue, label } = option as { value?: unknown; label?: unknown };
		if (typeof optionValue !== "string" || !optionValue.trim() || typeof label !== "string" || !label.trim() || seen.has(optionValue)) return false;
		seen.add(optionValue);
		return true;
	});
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
		case "video":
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
			if (field.config.kind === "url" || field.config.kind === "video") {
				try {
					const url = new URL(answer);
					if (url.protocol !== "https:" && url.protocol !== "http:") {
						return `${field.label} must be an http(s) URL`;
					}
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
			if (field.required && answer.length === 0) return `${field.label} is required`;
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
			const seenEmails = new Set<string>();
			for (const speaker of answer) {
				if (!isSpeakerAnswer(speaker)) {
					return "Each speaker needs name and email";
				}
				const email = speaker.email.trim().toLowerCase();
				if (seenEmails.has(email)) {
					return "Each speaker needs a distinct email";
				}
				seenEmails.add(email);
			}
			return null;
		}
		case "file_upload": {
			if (!isFileUploadAnswer(answer)) return `${field.label} must include an uploaded file`;
			if (!answer.filename.trim()) return `${field.label} must include a filename`;
			return null;
		}
		default: {
			const _exhaustive: never = field.config;
			return _exhaustive;
		}
	}
}

export function isFileUploadAnswer(value: unknown): value is FileUploadAnswer {
	if (typeof value !== "object" || value === null) return false;
	const record = value as { assetId?: unknown; filename?: unknown; contentType?: unknown };
	return typeof record.assetId === "string" && record.assetId.trim().length > 0
		&& typeof record.filename === "string"
		&& (record.contentType === undefined || typeof record.contentType === "string");
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
