import { rowToFieldDef } from "@/lib/cfp/form-admin";
import { listFormFields } from "@/lib/db/queries";
import type { CfpFormRow, FormFieldRow } from "@/lib/db/types";
import {
	isFieldType,
	parseCategoryRoute,
	parseFieldConfig,
	parseFormSections,
	parseVisibilityRule,
	type CategoryRoute,
	type FormFieldDef,
	type FormSection,
} from "@/lib/domain";

export type FormRevisionSnapshot = {
	fields: FormFieldDef[];
	sections: FormSection[];
	categoryRoutingJson: string | null;
	minSpeakers: number;
	maxSpeakers: number;
};

export type FormRevisionRecord = {
	id: string;
	formId: string;
	revision: number;
	snapshot: FormRevisionSnapshot;
	publishedAt: number;
};

function applySpeakerBounds(snapshot: FormRevisionSnapshot): FormFieldDef[] {
	return snapshot.fields.map((field) => {
		if (field.config.kind !== "speaker_block") return field;
		return {
			...field,
			config: {
				...field.config,
				minSpeakers: snapshot.minSpeakers,
				maxSpeakers: snapshot.maxSpeakers,
			},
		};
	});
}

export function fieldsFromSnapshot(snapshot: FormRevisionSnapshot): FormFieldDef[] {
	return applySpeakerBounds(snapshot);
}

export function snapshotsEqual(left: FormRevisionSnapshot, right: FormRevisionSnapshot): boolean {
	return JSON.stringify(left) === JSON.stringify(right);
}

export async function snapshotWorkingForm(
	db: D1Database,
	form: CfpFormRow,
): Promise<FormRevisionSnapshot> {
	const rows = await listFormFields(db, form.id);
	return {
		fields: rows.map((row) => rowToFieldDef(row)),
		sections: parseFormSections(form.sections_json),
		categoryRoutingJson: form.category_routing_json ?? null,
		minSpeakers: form.min_speakers,
		maxSpeakers: form.max_speakers,
	};
}

function parseSnapshot(raw: string): FormRevisionSnapshot | null {
	try {
		const value: unknown = JSON.parse(raw);
		if (!value || typeof value !== "object" || Array.isArray(value)) return null;
		const record = value as Record<string, unknown>;
		if (!Array.isArray(record.fields)) return null;
		const fields: FormFieldDef[] = [];
		for (const item of record.fields) {
			if (!item || typeof item !== "object" || Array.isArray(item)) return null;
			const field = item as Record<string, unknown>;
			if (typeof field.key !== "string" || typeof field.label !== "string") return null;
			if (typeof field.fieldType !== "string" || !isFieldType(field.fieldType)) return null;
			fields.push({
				key: field.key,
				label: field.label,
				fieldType: field.fieldType,
				required: field.required === true,
				position: typeof field.position === "number" ? field.position : 0,
				visibilityRule: parseVisibilityRule(
					typeof field.visibilityRule === "string"
						? field.visibilityRule
						: JSON.stringify(field.visibilityRule ?? { op: "always" }),
				),
				config: parseFieldConfig(field.fieldType, JSON.stringify(field.config ?? { kind: field.fieldType })),
				helpText: typeof field.helpText === "string" ? field.helpText : undefined,
				sectionKey: typeof field.sectionKey === "string" ? field.sectionKey : null,
			});
		}
		return {
			fields,
			sections: parseFormSections(
				typeof record.sections === "string" ? record.sections : JSON.stringify(record.sections ?? []),
			),
			categoryRoutingJson:
				typeof record.categoryRoutingJson === "string" ? record.categoryRoutingJson : null,
			minSpeakers: typeof record.minSpeakers === "number" ? record.minSpeakers : 1,
			maxSpeakers: typeof record.maxSpeakers === "number" ? record.maxSpeakers : 8,
		};
	} catch {
		return null;
	}
}

export async function getFormRevision(
	db: D1Database,
	revisionId: string,
): Promise<FormRevisionRecord | null> {
	const row = await db
		.prepare(
			`SELECT id, form_id, revision, snapshot_json, published_at
			 FROM cfp_form_revisions WHERE id = ?`,
		)
		.bind(revisionId)
		.first<{
			id: string;
			form_id: string;
			revision: number;
			snapshot_json: string;
			published_at: number;
		}>();
	if (!row) return null;
	const snapshot = parseSnapshot(row.snapshot_json);
	if (!snapshot) return null;
	return {
		id: row.id,
		formId: row.form_id,
		revision: row.revision,
		snapshot,
		publishedAt: row.published_at,
	};
}

export async function publishFormRevision(
	db: D1Database,
	args: { form: CfpFormRow; accountId?: string | null; now?: number },
): Promise<{ id: string; revision: number; snapshot: FormRevisionSnapshot }> {
	const snapshot = await snapshotWorkingForm(db, args.form);
	const now = args.now ?? Date.now();
	const latest = await db
		.prepare("SELECT COALESCE(MAX(revision), 0) AS revision FROM cfp_form_revisions WHERE form_id = ?")
		.bind(args.form.id)
		.first<{ revision: number }>();
	const revision = (latest?.revision ?? 0) + 1;
	const id = crypto.randomUUID();
	await db.batch([
		db.prepare(
			`INSERT INTO cfp_form_revisions (
				id, form_id, revision, snapshot_json, published_at, published_by_account_id
			) VALUES (?, ?, ?, ?, ?, ?)`,
		).bind(id, args.form.id, revision, JSON.stringify(snapshot), now, args.accountId ?? null),
		db.prepare("UPDATE cfp_forms SET published_revision_id = ?, updated_at = ? WHERE id = ?").bind(
			id,
			now,
			args.form.id,
		),
	]);
	return { id, revision, snapshot };
}

export async function fieldLabelsForSubmission(
	db: D1Database,
	submission: { form_id: string; form_revision_id?: string | null },
): Promise<Map<string, string>> {
	if (submission.form_revision_id) {
		const revision = await getFormRevision(db, submission.form_revision_id);
		if (revision) {
			return new Map(revision.snapshot.fields.map((field) => [field.key, field.label]));
		}
	}
	const rows = await listFormFields(db, submission.form_id);
	return new Map(rows.map((row: FormFieldRow) => [row.key, row.label]));
}

export async function fieldLabelsForSubmissions(
	db: D1Database,
	submissions: Array<{ id: string; form_id: string; form_revision_id?: string | null }>,
): Promise<Map<string, Map<string, string>>> {
	const labels = new Map<string, Map<string, string>>();
	const liveByForm = new Map<string, Map<string, string>>();
	const byRevision = new Map<string, Map<string, string>>();
	for (const submission of submissions) {
		if (submission.form_revision_id) {
			let revisionLabels = byRevision.get(submission.form_revision_id);
			if (!revisionLabels) {
				revisionLabels = await fieldLabelsForSubmission(db, submission);
				byRevision.set(submission.form_revision_id, revisionLabels);
			}
			labels.set(submission.id, revisionLabels);
			continue;
		}
		let formLabels = liveByForm.get(submission.form_id);
		if (!formLabels) {
			formLabels = await fieldLabelsForSubmission(db, submission);
			liveByForm.set(submission.form_id, formLabels);
		}
		labels.set(submission.id, formLabels);
	}
	return labels;
}

export function categoryRouteFromSnapshot(snapshot: FormRevisionSnapshot): CategoryRoute | null {
	return parseCategoryRoute(snapshot.categoryRoutingJson);
}
