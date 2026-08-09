import type { AnswerMap, FormFieldDef } from "@/lib/domain";

/** Returns the first visible required multiselect without a selected value. */
export function missingRequiredVisibleMultiselect(
	fields: FormFieldDef[],
	answers: AnswerMap,
): FormFieldDef | null {
	return fields.find((field) => {
		const answer = answers[field.key];
		return field.fieldType === "multiselect"
			&& field.required
			&& (!Array.isArray(answer) || answer.length === 0);
	}) ?? null;
}
