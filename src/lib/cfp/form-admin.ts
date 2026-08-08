import {
	FIELD_TYPE_REGISTRY,
	isFieldType,
	type FieldConfig,
	type FieldType,
	type FormFieldDef,
} from "@/lib/domain";
import type { VisibilityRule } from "@/lib/domain/visibility";
import type { CfpFormRow, FormFieldRow } from "@/lib/db/types";

function newId(prefix: string): string {
	return `${prefix}_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
}

export async function listFormsForEvent(
	db: D1Database,
	eventId: string,
): Promise<CfpFormRow[]> {
	const result = await db
		.prepare(
			`SELECT * FROM cfp_forms
       WHERE event_id = ?
       ORDER BY created_at ASC`,
		)
		.bind(eventId)
		.all<CfpFormRow>();
	return result.results;
}

export async function updateFormMeta(
	db: D1Database,
	args: {
		formId: string;
		title?: string;
		description?: string | null;
		status?: "draft" | "open" | "closed";
		closesAt?: number | null;
	},
): Promise<void> {
	const existing = await db
		.prepare("SELECT * FROM cfp_forms WHERE id = ?")
		.bind(args.formId)
		.first<CfpFormRow>();
	if (!existing) throw new Error("Form not found");

	const title = args.title?.trim() || existing.title;
	const description =
		args.description === undefined ? existing.description : args.description;
	const status = args.status ?? (existing.status as "draft" | "open" | "closed");
	const closesAt =
		args.closesAt === undefined ? existing.closes_at : args.closesAt;
	const now = Date.now();

	await db
		.prepare(
			`UPDATE cfp_forms
       SET title = ?, description = ?, status = ?, closes_at = ?, updated_at = ?
       WHERE id = ?`,
		)
		.bind(title, description, status, closesAt, now, args.formId)
		.run();
}

export type FieldWriteInput = {
	key: string;
	label: string;
	fieldType: FieldType;
	required: boolean;
	position: number;
	visibilityRule: VisibilityRule;
	config: FieldConfig;
};

export function validateFieldWrite(input: unknown): FieldWriteInput | string {
	if (typeof input !== "object" || input === null) return "Invalid field body";
	const body = input as Record<string, unknown>;
	const key = typeof body.key === "string" ? body.key.trim() : "";
	const label = typeof body.label === "string" ? body.label.trim() : "";
	const fieldType =
		typeof body.fieldType === "string" && isFieldType(body.fieldType)
			? body.fieldType
			: null;
	if (!/^[a-z][a-z0-9_]{0,39}$/.test(key)) {
		return "key must be snake_case starting with a letter";
	}
	if (!label) return "label is required";
	if (!fieldType) return "fieldType is invalid";

	const required = Boolean(body.required);
	const position =
		typeof body.position === "number" && Number.isFinite(body.position)
			? Math.max(0, Math.floor(body.position))
			: 0;

	let visibilityRule: VisibilityRule = { op: "always" };
	if (body.visibilityRule !== undefined) {
		const parsed = parseVisibilityInput(body.visibilityRule);
		if (typeof parsed === "string") return parsed;
		visibilityRule = parsed;
	}

	let config: FieldConfig = FIELD_TYPE_REGISTRY[fieldType].defaultConfig;
	if (body.config !== undefined) {
		const parsed = parseConfigInput(fieldType, body.config);
		if (typeof parsed === "string") return parsed;
		config = parsed;
	}

	return {
		key,
		label,
		fieldType,
		required,
		position,
		visibilityRule,
		config,
	};
}

function parseVisibilityInput(raw: unknown): VisibilityRule | string {
	if (typeof raw !== "object" || raw === null || !("op" in raw)) {
		return "visibilityRule is invalid";
	}
	const op = (raw as { op: unknown }).op;
	if (op === "always") return { op: "always" };
	if (op === "eq") {
		const r = raw as { fieldKey?: unknown; value?: unknown };
		if (typeof r.fieldKey !== "string" || typeof r.value !== "string") {
			return "eq rule needs fieldKey and value";
		}
		return { op: "eq", fieldKey: r.fieldKey, value: r.value };
	}
	if (op === "in") {
		const r = raw as { fieldKey?: unknown; values?: unknown };
		if (
			typeof r.fieldKey !== "string" ||
			!Array.isArray(r.values) ||
			!r.values.every((v) => typeof v === "string")
		) {
			return "in rule needs fieldKey and string values";
		}
		return { op: "in", fieldKey: r.fieldKey, values: r.values };
	}
	return "unsupported visibilityRule.op";
}

function parseConfigInput(
	fieldType: FieldType,
	raw: unknown,
): FieldConfig | string {
	if (typeof raw !== "object" || raw === null || !("kind" in raw)) {
		return "config is invalid";
	}
	const kind = (raw as { kind: unknown }).kind;
	if (kind !== fieldType) return "config.kind must match fieldType";
	return raw as FieldConfig;
}

export async function insertFormField(
	db: D1Database,
	formId: string,
	input: FieldWriteInput,
): Promise<FormFieldRow> {
	const id = newId("field");
	const now = Date.now();
	await db
		.prepare(
			`INSERT INTO form_fields (
        id, form_id, key, label, field_type, required, position,
        visibility_rule, config, soft_deleted
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
		)
		.bind(
			id,
			formId,
			input.key,
			input.label,
			input.fieldType,
			input.required ? 1 : 0,
			input.position,
			JSON.stringify(input.visibilityRule),
			JSON.stringify(input.config),
		)
		.run();
	await db
		.prepare("UPDATE cfp_forms SET updated_at = ? WHERE id = ?")
		.bind(now, formId)
		.run();
	const row = await db
		.prepare("SELECT * FROM form_fields WHERE id = ?")
		.bind(id)
		.first<FormFieldRow>();
	if (!row) throw new Error("Failed to insert field");
	return row;
}

export async function updateFormField(
	db: D1Database,
	fieldId: string,
	input: FieldWriteInput,
): Promise<FormFieldRow> {
	const existing = await db
		.prepare("SELECT * FROM form_fields WHERE id = ? AND soft_deleted = 0")
		.bind(fieldId)
		.first<FormFieldRow>();
	if (!existing) throw new Error("Field not found");
	// Keys are the answers_json contract; renaming would orphan stored answers.
	if (input.key !== existing.key) {
		throw new Error("Field key is immutable after create");
	}

	await db
		.prepare(
			`UPDATE form_fields
       SET label = ?, field_type = ?, required = ?, position = ?,
           visibility_rule = ?, config = ?
       WHERE id = ?`,
		)
		.bind(
			input.label,
			input.fieldType,
			input.required ? 1 : 0,
			input.position,
			JSON.stringify(input.visibilityRule),
			JSON.stringify(input.config),
			fieldId,
		)
		.run();
	await db
		.prepare("UPDATE cfp_forms SET updated_at = ? WHERE id = ?")
		.bind(Date.now(), existing.form_id)
		.run();

	const row = await db
		.prepare("SELECT * FROM form_fields WHERE id = ?")
		.bind(fieldId)
		.first<FormFieldRow>();
	if (!row) throw new Error("Failed to update field");
	return row;
}

export async function softDeleteFormField(
	db: D1Database,
	fieldId: string,
): Promise<void> {
	const existing = await db
		.prepare("SELECT * FROM form_fields WHERE id = ?")
		.bind(fieldId)
		.first<FormFieldRow>();
	if (!existing) throw new Error("Field not found");
	// Free the UNIQUE(form_id, key) slot so the key can be re-added later.
	const tombstoneKey = `${existing.key}__deleted__${existing.id}`;
	await db
		.prepare(
			`UPDATE form_fields SET soft_deleted = 1, key = ? WHERE id = ?`,
		)
		.bind(tombstoneKey, fieldId)
		.run();
	await db
		.prepare("UPDATE cfp_forms SET updated_at = ? WHERE id = ?")
		.bind(Date.now(), existing.form_id)
		.run();
}

export async function reorderFormFields(
	db: D1Database,
	formId: string,
	orderedIds: string[],
): Promise<void> {
	for (let i = 0; i < orderedIds.length; i++) {
		const id = orderedIds[i]!;
		await db
			.prepare(
				`UPDATE form_fields SET position = ?
         WHERE id = ? AND form_id = ? AND soft_deleted = 0`,
			)
			.bind(i, id, formId)
			.run();
	}
	await db
		.prepare("UPDATE cfp_forms SET updated_at = ? WHERE id = ?")
		.bind(Date.now(), formId)
		.run();
}

export function rowToFieldDef(row: FormFieldRow): FormFieldDef {
	if (!isFieldType(row.field_type)) {
		throw new Error(`Unknown field_type: ${row.field_type}`);
	}
	return {
		key: row.key,
		label: row.label,
		fieldType: row.field_type,
		required: row.required === 1,
		position: row.position,
		visibilityRule: JSON.parse(row.visibility_rule) as VisibilityRule,
		config: JSON.parse(row.config) as FieldConfig,
	};
}
