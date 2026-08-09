import {
	evaluateVisibilityRule,
	type AnswerMap,
	type FormFieldDef,
} from "@/lib/domain";
import { isPlausibleEmail } from "@/lib/security/crypto";

function isRequiredFieldComplete(field: FormFieldDef, answer: unknown): boolean {
	switch (field.config.kind) {
		case "text":
		case "textarea":
		case "url":
		case "video":
		case "email":
			return typeof answer === "string" && answer.trim().length > 0;
		case "number":
			return typeof answer === "number" && !Number.isNaN(answer);
		case "select":
			return typeof answer === "string" && answer.length > 0;
		case "multiselect":
			return Array.isArray(answer) && answer.length > 0;
		case "speaker_block": {
			if (!Array.isArray(answer)) return false;
			const min = Math.max(1, field.config.minSpeakers ?? 1);
			const speakers = answer.filter(
				(item) =>
					typeof item === "object"
					&& item !== null
					&& typeof (item as { name?: unknown }).name === "string"
					&& typeof (item as { email?: unknown }).email === "string"
					&& (item as { name: string }).name.trim().length > 0
					&& isPlausibleEmail((item as { email: string }).email),
			);
			return speakers.length >= min;
		}
		default:
			return false;
	}
}

export function computeCfpProgress(
	fields: FormFieldDef[],
	answers: AnswerMap,
	identity: { name: string; email: string },
): { completed: number; total: number } {
	const visibleRequired = fields.filter(
		(field) => field.required && evaluateVisibilityRule(field.visibilityRule, answers),
	);
	const total = 2 + visibleRequired.length;
	let completed = 0;
	if (identity.name.trim().length > 0) completed += 1;
	if (isPlausibleEmail(identity.email)) completed += 1;

	for (const field of visibleRequired) {
		if (isRequiredFieldComplete(field, answers[field.key])) completed += 1;
	}

	return { completed: Math.min(completed, total), total };
}
