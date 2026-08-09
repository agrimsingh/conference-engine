import {
	isFieldType,
	parseFieldConfig,
	parseFormSections,
	parseVisibilityRule,
	parseCategoryRoute,
	type CategoryRoute,
	type FormFieldDef,
	type FormSectionDef,
} from "@/lib/domain";
import {
	getEventBySlug,
	getOpenForm,
	getPublicFormBySlug,
	listFormFields,
} from "@/lib/db/queries";
import { helpTextFromStoredConfig } from "@/lib/cfp/form-admin";
import type { CfpFormRow, EventRow } from "@/lib/db/types";

export type LoadedCfpForm = {
	event: EventRow;
	form: CfpFormRow;
	fields: FormFieldDef[];
	sections: FormSectionDef[];
	categoryRoute: CategoryRoute | null;
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
		: await getPublicFormBySlug(db, event.id, formSlug);
	if (!form) return null;

	const rows = await listFormFields(db, form.id);
	const fields: FormFieldDef[] = rows.map((row) => {
		if (!isFieldType(row.field_type)) {
			throw new Error(`Unknown field_type: ${row.field_type}`);
		}
		const config = parseFieldConfig(row.field_type, row.config);
		return {
			key: row.key,
			label: row.label,
			fieldType: row.field_type,
			required: row.required === 1,
			position: row.position,
			visibilityRule: parseVisibilityRule(row.visibility_rule),
			// Speaker bounds are form policy, so a later settings edit applies to
			// every speaker block without mutating historical field definitions.
			config:
				config.kind === "speaker_block"
					? { ...config, minSpeakers: form.min_speakers, maxSpeakers: form.max_speakers }
					: config,
			helpText: helpTextFromStoredConfig(row.config),
			sectionKey: row.section_key?.trim() || undefined,
		};
	});

	return {
		event,
		form,
		fields,
		sections: parseFormSections(form.sections_json),
		categoryRoute: parseCategoryRoute(form.category_routing_json),
	};
}
