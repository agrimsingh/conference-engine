export const TASK_FORM_FIELD_TYPES = ["text", "textarea", "select", "multiselect", "email", "url", "number"] as const;
export type TaskFormFieldType = (typeof TASK_FORM_FIELD_TYPES)[number];

export type TaskFormField = {
	key: string;
	label: string;
	type: TaskFormFieldType;
	required: boolean;
	options?: string[];
};

export function parseTaskFormFields(value: unknown): TaskFormField[] {
	if (typeof value === "string") {
		try { value = JSON.parse(value); } catch { throw new Error("Form questions are invalid JSON"); }
	}
	if (!Array.isArray(value) || value.length === 0) throw new Error("A form task needs at least one question");
	if (value.length > 30) throw new Error("A form task can have at most 30 questions");
	const seen = new Set<string>();
	return value.map((raw, index) => {
		if (typeof raw !== "object" || raw === null || Array.isArray(raw)) throw new Error(`Question ${index + 1} is invalid`);
		const item = raw as Record<string, unknown>;
		const key = typeof item.key === "string" ? item.key.trim() : "";
		const label = typeof item.label === "string" ? item.label.trim() : "";
		const type = item.type;
		if (!/^[a-z0-9-]{1,64}$/.test(key)) throw new Error(`Question ${index + 1} needs a lowercase key`);
		if (seen.has(key)) throw new Error(`Question key ${key} is duplicated`);
		seen.add(key);
		if (!label || label.length > 160) throw new Error(`Question ${index + 1} needs a label`);
		if (!TASK_FORM_FIELD_TYPES.includes(type as TaskFormFieldType)) throw new Error(`Question ${label} has an unsupported type`);
		const field: TaskFormField = { key, label, type: type as TaskFormFieldType, required: item.required === true };
		if (type === "select" || type === "multiselect") {
			const options = Array.isArray(item.options) ? item.options.map((option) => typeof option === "string" ? option.trim() : "").filter(Boolean) : [];
			if (options.length < 1 || options.length > 50 || new Set(options).size !== options.length) throw new Error(`${label} needs unique choices`);
			field.options = options;
		}
		return field;
	});
}

export function parseSavedTaskFormFields(value: string | null | undefined): TaskFormField[] | null {
	if (!value) return null;
	try { return parseTaskFormFields(value); } catch { return null; }
}

export function validateTaskFormAnswers(fields: TaskFormField[], value: unknown): { ok: true; answers: Record<string, unknown> } | { ok: false; error: string } {
	if (typeof value !== "object" || value === null || Array.isArray(value)) return { ok: false, error: "Form answers must be an object" };
	const source = value as Record<string, unknown>;
	const answers: Record<string, unknown> = {};
	for (const field of fields) {
		const answer = source[field.key];
		const empty = answer === undefined || answer === null || answer === "" || Array.isArray(answer) && answer.length === 0;
		if (empty) {
			if (field.required) return { ok: false, error: `${field.label} is required` };
			continue;
		}
		if (field.type === "multiselect") {
			if (!Array.isArray(answer) || !answer.every((item) => typeof item === "string") || answer.some((item) => !field.options?.includes(item))) return { ok: false, error: `${field.label} has an invalid choice` };
			answers[field.key] = answer;
			continue;
		}
		if (field.type === "number") {
			const number = typeof answer === "number" ? answer : Number(answer);
			if (!Number.isFinite(number)) return { ok: false, error: `${field.label} must be a number` };
			answers[field.key] = number;
			continue;
		}
		if (typeof answer !== "string") return { ok: false, error: `${field.label} must be text` };
		const text = answer.trim();
		if (text.length > 10_000) return { ok: false, error: `${field.label} is too long` };
		if (field.type === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text)) return { ok: false, error: `${field.label} must be a valid email` };
		if (field.type === "url") {
			try { const url = new URL(text); if (!['http:', 'https:'].includes(url.protocol)) throw new Error(); } catch { return { ok: false, error: `${field.label} must be a valid URL` }; }
		}
		if (field.type === "select" && !field.options?.includes(text)) return { ok: false, error: `${field.label} has an invalid choice` };
		answers[field.key] = text;
	}
	return { ok: true, answers };
}
