import {
	isFieldType,
	parseFieldConfig,
	parseFormSections,
	parseVisibilityRule,
	parseCategoryRoute,
	type CategoryRoute,
	type FormFieldDef,
	type FormSection,
} from "@/lib/domain";
import {
	getEventBySlug,
	getOpenForm,
	getPublicFormBySlug,
	listFormFields,
} from "@/lib/db/queries";
import { helpTextFromStoredConfig } from "@/lib/cfp/form-admin";
import {
	categoryRouteFromSnapshot,
	fieldsFromSnapshot,
	getFormRevision,
} from "@/lib/cfp/form-revisions";
import type { CfpFormRow, EventRow } from "@/lib/db/types";

export type LoadedCfpForm = {
	event: EventRow;
	form: CfpFormRow;
	fields: FormFieldDef[];
	sections: FormSection[];
	categoryRoute: CategoryRoute | null;
	revisionId: string | null;
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

	const published = form.published_revision_id
		? await getFormRevision(db, form.published_revision_id)
		: null;
	if (published) {
		return {
			event,
			form,
			fields: fieldsFromSnapshot(published.snapshot),
			sections: published.snapshot.sections,
			categoryRoute: categoryRouteFromSnapshot(published.snapshot),
			revisionId: published.id,
		};
	}

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
			config:
				config.kind === "speaker_block"
					? { ...config, minSpeakers: form.min_speakers, maxSpeakers: form.max_speakers }
					: config,
			helpText: helpTextFromStoredConfig(row.config),
			sectionKey: row.section_key ?? null,
		};
	});

	return {
		event,
		form,
		fields,
		sections: parseFormSections(form.sections_json),
		categoryRoute: parseCategoryRoute(form.category_routing_json),
		revisionId: null,
	};
}
