import {
	isFieldType,
	parseFieldConfig,
	parseVisibilityRule,
	type FormFieldDef,
} from "@/lib/domain";
import {
	getEventBySlug,
	getFormBySlug,
	getOpenForm,
	listFormFields,
} from "@/lib/db/queries";
import { helpTextFromStoredConfig } from "@/lib/cfp/form-admin";
import type { CfpFormRow, EventRow } from "@/lib/db/types";

export type LoadedCfpForm = {
	event: EventRow;
	form: CfpFormRow;
	fields: FormFieldDef[];
};

export async function loadCfpForm(
	db: D1Database,
	eventSlug: string,
	formSlug: string,
	opts?: { requireOpen?: boolean },
): Promise<LoadedCfpForm | null> {
	const event = await getEventBySlug(db, eventSlug);
	if (!event) return null;

	const form = opts?.requireOpen
		? await getOpenForm(db, event.id, formSlug)
		: await getFormBySlug(db, event.id, formSlug);
	if (!form) return null;

	const rows = await listFormFields(db, form.id);
	const fields: FormFieldDef[] = rows.map((row) => {
		if (!isFieldType(row.field_type)) {
			throw new Error(`Unknown field_type: ${row.field_type}`);
		}
		return {
			key: row.key,
			label: row.label,
			fieldType: row.field_type,
			required: row.required === 1,
			position: row.position,
			visibilityRule: parseVisibilityRule(row.visibility_rule),
			config: parseFieldConfig(row.field_type, row.config),
			helpText: helpTextFromStoredConfig(row.config),
		};
	});

	return { event, form, fields };
}
