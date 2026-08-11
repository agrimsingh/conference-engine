"use client";

import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import { AdminSectionShell } from "@/components/admin-section-shell";
import { Button, noticeClasses } from "@/components/ui";
import { FIELD_TYPES, type FieldType, type FormFieldDef } from "@/lib/domain/form-fields";
import { type CategoryRoute } from "@/lib/domain/category-routing";
import { type FormSection } from "@/lib/domain/form-sections";
import { type VisibilityRule } from "@/lib/domain/visibility";

import type { SelectOption } from "@/lib/domain/form-fields";
import {
	parseFormBuilderSection,
	type FormBuilderSectionId,
} from "./form-builder-section";
import { FormBuilderPreview } from "./form-builder-preview";

const SECTIONS: Array<{
	id: FormBuilderSectionId;
	label: string;
	description: string;
}> = [
	{
		id: "settings",
		label: "Settings",
		description: "Title, limits, open window, email copy, and category routing.",
	},
	{
		id: "sections",
		label: "Sections",
		description: "Optional groups for the public form. Headers render on the live form now.",
	},
	{
		id: "fields",
		label: "Fields",
		description: "Drag rows to reorder. Up and Down still work.",
	},
	{
		id: "add-field",
		label: "Add field",
		description: "Create a new question on this form.",
	},
];

type FieldRow = {
	id: string;
	key: string;
	label: string;
	fieldType: FieldType;
	required: boolean;
	position: number;
	helpText?: string;
	visibilityRule: VisibilityRule;
	config: Record<string, unknown>;
	sectionKey?: string | null;
};

type Props = {
	eventSlug: string;
	formSlug: string;
	initialSection: FormBuilderSectionId;
	initialTitle: string;
	initialDescription: string;
	initialStatus: string;
	initialOpensAt: number | null;
	initialClosesAt: number | null;
	initialCategoryRoute: CategoryRoute | null;
	initialMinSpeakers: number;
	initialMaxSpeakers: number;
	initialDraftsEnabled: boolean;
	initialSubmissionLimit: number;
	initialWelcomeCopy: string;
	initialConfirmationCopy: string;
	initialReminderCopy: string;
	initialThankYouCopy: string;
	initialSections: FormSection[];
	initialSubmissionCount: number;
	initialFields: FieldRow[];
};

function defaultSelectOptions(): SelectOption[] {
	return [{ value: "option_a", label: "Option A" }];
}

function readSelectOptions(config: Record<string, unknown>): SelectOption[] {
	if (!Array.isArray(config.options)) return defaultSelectOptions();
	const options: SelectOption[] = [];
	for (const item of config.options) {
		if (
			typeof item === "object" &&
			item !== null &&
			"value" in item &&
			"label" in item &&
			typeof (item as { value: unknown }).value === "string" &&
			typeof (item as { label: unknown }).label === "string"
		) {
			options.push({
				value: (item as { value: string }).value,
				label: (item as { label: string }).label,
			});
		}
	}
	return options.length > 0 ? options : defaultSelectOptions();
}

function dateTimeInputValue(ms: number | null): string {
	if (ms == null) return "";
	const d = new Date(ms);
	const pad = (n: number) => String(n).padStart(2, "0");
	return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function parseDateTimeInput(value: string): number | null {
	const trimmed = value.trim();
	if (!trimmed) return null;
	const ms = Date.parse(trimmed);
	return Number.isFinite(ms) ? ms : null;
}

type VisibilityOp = "always" | "never" | "eq" | "neq" | "in";

type VisibilityDraft = {
	visibilityOp: VisibilityOp;
	visibilityFieldKey: string;
	visibilityValue: string;
	visibilityValues: string;
};

type ConfigDraft = {
	placeholder: string;
	maxLength: string;
	rows: string;
	numberMin: string;
	numberMax: string;
	numberStep: string;
	uploadAccept: string;
	uploadMaxMb: string;
};

function emptyConfigDraft(): ConfigDraft {
	return {
		placeholder: "",
		maxLength: "",
		rows: "",
		numberMin: "",
		numberMax: "",
		numberStep: "",
		uploadAccept: "",
		uploadMaxMb: "",
	};
}

function configDraftFromField(config: Record<string, unknown>): ConfigDraft {
	return {
		placeholder: typeof config.placeholder === "string" ? config.placeholder : "",
		maxLength: typeof config.maxLength === "number" ? String(config.maxLength) : "",
		rows: typeof config.rows === "number" ? String(config.rows) : "",
		numberMin: typeof config.min === "number" ? String(config.min) : "",
		numberMax: typeof config.max === "number" ? String(config.max) : "",
		numberStep: typeof config.step === "number" ? String(config.step) : "",
		uploadAccept: Array.isArray(config.accept) ? config.accept.join(", ") : "",
		uploadMaxMb: typeof config.maxBytes === "number" ? String(Math.round(config.maxBytes / (1024 * 1024))) : "",
	};
}

function optionalPositiveInt(raw: string): number | undefined {
	const trimmed = raw.trim();
	if (!trimmed) return undefined;
	const value = Number(trimmed);
	if (!Number.isInteger(value) || value < 1) return undefined;
	return value;
}

function optionalFiniteNumber(raw: string): number | undefined {
	const trimmed = raw.trim();
	if (!trimmed) return undefined;
	const value = Number(trimmed);
	if (!Number.isFinite(value)) return undefined;
	return value;
}

function buildVisibilityRule(draft: VisibilityDraft): VisibilityRule {
	if (draft.visibilityOp === "never") return { op: "never" };
	if (
		(draft.visibilityOp === "eq" || draft.visibilityOp === "neq") &&
		draft.visibilityFieldKey.trim() &&
		draft.visibilityValue.trim()
	) {
		return {
			op: draft.visibilityOp,
			fieldKey: draft.visibilityFieldKey.trim(),
			value: draft.visibilityValue.trim(),
		};
	}
	if (draft.visibilityOp === "in" && draft.visibilityFieldKey.trim()) {
		const values = [...new Set(draft.visibilityValues.split(",").map((value) => value.trim()).filter(Boolean))];
		if (values.length) return { op: "in", fieldKey: draft.visibilityFieldKey.trim(), values };
	}
	return { op: "always" };
}

function visibilityDraftFromRule(rule: VisibilityRule): VisibilityDraft {
	if (rule.op === "never") {
		return {
			visibilityOp: "never",
			visibilityFieldKey: "",
			visibilityValue: "",
			visibilityValues: "",
		};
	}
	if (rule.op === "eq" || rule.op === "neq") {
		return {
			visibilityOp: rule.op,
			visibilityFieldKey: rule.fieldKey,
			visibilityValue: rule.value,
			visibilityValues: "",
		};
	}
	if (rule.op === "in") {
		return {
			visibilityOp: "in",
			visibilityFieldKey: rule.fieldKey,
			visibilityValue: "",
			visibilityValues: rule.values.join(", "),
		};
	}
	return {
		visibilityOp: "always",
		visibilityFieldKey: "",
		visibilityValue: "",
		visibilityValues: "",
	};
}

function visibilitySummary(rule: VisibilityRule): string {
	if (rule.op === "eq" && rule.fieldKey && rule.value != null) {
		return `visible when ${rule.fieldKey} = ${rule.value}`;
	}
	if (rule.op === "neq" && rule.fieldKey && rule.value != null) {
		return `visible when ${rule.fieldKey} ≠ ${rule.value}`;
	}
	if (rule.op === "in" && rule.fieldKey && rule.values?.length) {
		return `visible when ${rule.fieldKey} in [${rule.values.join(", ")}]`;
	}
	if (rule.op === "always") return "always visible";
	if (rule.op === "never") return "never visible";
	return `visible when ${rule.op}`;
}

function VisibilityFields({
	op,
	fieldKey,
	value,
	values,
	siblingKeys,
	onChange,
}: {
	op: VisibilityOp;
	fieldKey: string;
	value: string;
	values: string;
	siblingKeys: string[];
	onChange: (next: VisibilityDraft) => void;
}) {
	return (
		<>
			<label className="block text-xs text-neutral-400">
				Visibility
				<select
					className="mt-1 w-full rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-100"
					value={op}
					onChange={(e) =>
						onChange({
							visibilityOp: e.target.value as VisibilityOp,
							visibilityFieldKey: fieldKey,
							visibilityValue: value,
							visibilityValues: values,
						})
					}
				>
					<option value="always">Always</option>
					<option value="never">Never</option>
					<option value="eq">Equals</option>
					<option value="neq">Not equals</option>
					<option value="in">Is one of</option>
				</select>
			</label>
			{op === "eq" || op === "neq" || op === "in" ? (
				<div className="grid gap-2 sm:grid-cols-2">
					<label className="block text-xs text-neutral-400">
						Field key
						{siblingKeys.length > 0 ? (
							<select
								className="mt-1 w-full rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-100"
								value={fieldKey}
								onChange={(e) =>
									onChange({
									visibilityOp: op,
									visibilityFieldKey: e.target.value,
									visibilityValue: value,
									visibilityValues: values,
									})
								}
							>
								<option value="">Select field…</option>
								{fieldKey && !siblingKeys.includes(fieldKey) ? (
									<option value={fieldKey}>{fieldKey}</option>
								) : null}
								{siblingKeys.map((key) => (
									<option key={key} value={key}>
										{key}
									</option>
								))}
							</select>
						) : (
							<input
								className="mt-1 w-full rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-100"
								placeholder="field key"
								value={fieldKey}
								onChange={(e) =>
									onChange({
									visibilityOp: op,
									visibilityFieldKey: e.target.value,
									visibilityValue: value,
									visibilityValues: values,
									})
								}
							/>
						)}
					</label>
					<label className="block text-xs text-neutral-400">
						{op === "in" ? "Values (comma-separated)" : "Value"}
						<input
							className="mt-1 w-full rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-100"
							placeholder={op === "in" ? "stage, workshop" : "value"}
							value={op === "in" ? values : value}
							onChange={(e) =>
								onChange({
									visibilityOp: op,
									visibilityFieldKey: fieldKey,
									visibilityValue: op === "eq" || op === "neq" ? e.target.value : value,
									visibilityValues: op === "in" ? e.target.value : values,
								})
							}
						/>
					</label>
				</div>
			) : null}
		</>
	);
}

export function FormBuilder({
	eventSlug,
	formSlug,
	initialSection,
	initialTitle,
	initialDescription,
	initialStatus,
	initialOpensAt,
	initialClosesAt,
	initialCategoryRoute,
	initialMinSpeakers,
	initialMaxSpeakers,
	initialDraftsEnabled,
	initialSubmissionLimit,
	initialWelcomeCopy,
	initialConfirmationCopy,
	initialReminderCopy,
	initialThankYouCopy,
	initialSections,
	initialSubmissionCount,
	initialFields,
}: Props) {
	const router = useRouter();
	const [section, setSectionState] = useState<FormBuilderSectionId>(initialSection);
	const [title, setTitle] = useState(initialTitle);
	const [description, setDescription] = useState(initialDescription);
	const [status, setStatus] = useState(initialStatus);
	const [opensAtInput, setOpensAtInput] = useState(dateTimeInputValue(initialOpensAt));
	const [closesAtInput, setClosesAtInput] = useState(dateTimeInputValue(initialClosesAt));
	const [categoryFieldKey, setCategoryFieldKey] = useState(initialCategoryRoute?.fieldKey ?? "");
	const [categoryMapText, setCategoryMapText] = useState(
		initialCategoryRoute ? Object.entries(initialCategoryRoute.map).map(([value, label]) => `${value} = ${label}`).join("\n") : "",
	);
	const [minSpeakers, setMinSpeakers] = useState(initialMinSpeakers);
	const [maxSpeakers, setMaxSpeakers] = useState(initialMaxSpeakers);
	const [draftsEnabled, setDraftsEnabled] = useState(initialDraftsEnabled);
	const [submissionLimit, setSubmissionLimit] = useState(initialSubmissionLimit);
	const [welcomeCopy, setWelcomeCopy] = useState(initialWelcomeCopy);
	const [confirmationCopy, setConfirmationCopy] = useState(initialConfirmationCopy);
	const [reminderCopy, setReminderCopy] = useState(initialReminderCopy);
	const [thankYouCopy, setThankYouCopy] = useState(initialThankYouCopy);
	const [fields, setFields] = useState(initialFields);
	const [sections, setSections] = useState<FormSection[]>(initialSections);
	const [dragId, setDragId] = useState<string | null>(null);
	const setSection = useCallback(
		(next: FormBuilderSectionId) => {
			setSectionState(next);
			const href =
				next === "settings"
					? `/admin/events/${eventSlug}/forms/${formSlug}`
					: `/admin/events/${eventSlug}/forms/${formSlug}?section=${next}`;
			router.replace(href, { scroll: false });
		},
		[eventSlug, formSlug, router],
	);
	const canEditKeys = initialSubmissionCount === 0;
	const [editingId, setEditingId] = useState<string | null>(null);
	const [editDraft, setEditDraft] = useState<(
		{
			key: string;
			label: string;
			required: boolean;
			helpText: string;
			sectionKey: string;
			visibilityOp: VisibilityOp;
			visibilityFieldKey: string;
			visibilityValue: string;
			visibilityValues: string;
			options: SelectOption[];
		} & ConfigDraft
	) | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);
	const [draft, setDraft] = useState({
		key: "",
		label: "",
		fieldType: "text" as FieldType,
		required: false,
		helpText: "",
		sectionKey: "",
		visibilityOp: "always" as VisibilityOp,
		visibilityFieldKey: "",
		visibilityValue: "",
		visibilityValues: "",
		options: defaultSelectOptions(),
		...emptyConfigDraft(),
	});

	const previewFields = useMemo(
		() => fields.map((field) => rowToPreviewField(field)),
		[fields],
	);

	const base = `/api/admin/events/${eventSlug}/forms/${formSlug}/fields`;
	const visibilitySourceKeys = fields.filter((field) => field.fieldType === "select").map((field) => field.key);

	function categoryRouteFromDraft(): CategoryRoute | null | "invalid" {
		const fieldKey = categoryFieldKey.trim();
		const lines = categoryMapText.split("\n").map((line) => line.trim()).filter(Boolean);
		if (!fieldKey && lines.length === 0) return null;
		if (!fieldKey || lines.length === 0) return "invalid";
		const map: Record<string, string> = {};
		for (const line of lines) {
			const divider = line.indexOf("=");
			const value = divider < 0 ? "" : line.slice(0, divider).trim();
			const label = divider < 0 ? "" : line.slice(divider + 1).trim();
			if (!value || !label || map[value]) return "invalid";
			map[value] = label;
		}
		return { fieldKey, map };
	}

	async function saveMeta() {
		const categoryRoute = categoryRouteFromDraft();
		if (categoryRoute === "invalid") {
			setError("Category routing needs a select field key and unique value = category lines.");
			return;
		}
		setBusy(true);
		setError(null);
		const res = await fetch(`/api/admin/events/${eventSlug}/forms`, {
			method: "PATCH",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				formSlug,
				title,
				description: description.trim() || null,
				status,
				opensAt: parseDateTimeInput(opensAtInput),
				closesAt: parseDateTimeInput(closesAtInput),
				categoryRoute,
				minSpeakers,
				maxSpeakers,
				draftsEnabled,
				submissionLimit,
				welcomeCopy: welcomeCopy.trim() || null,
				confirmationCopy: confirmationCopy.trim() || null,
				reminderCopy: reminderCopy.trim() || null,
				thankYouCopy: thankYouCopy.trim() || null,
				sections,
			}),
		});
		const json = (await res.json()) as { ok?: boolean; error?: string };
		setBusy(false);
		if (!res.ok || !json.ok) {
			setError(json.error || "Failed to save form");
			return;
		}
		router.refresh();
	}

	async function addField() {
		setBusy(true);
		setError(null);
		const position = fields.length;
		const config = buildFieldConfig(draft.fieldType, draft.options, draft);
		const visibilityRule = buildVisibilityRule(draft);

		const res = await fetch(base, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				key: draft.key,
				label: draft.label,
				fieldType: draft.fieldType,
				required: draft.required,
				position,
				visibilityRule,
				config,
				helpText: draft.helpText.trim() || undefined,
				sectionKey: draft.sectionKey.trim() || null,
			}),
		});
		const json = (await res.json()) as {
			ok?: boolean;
			error?: string;
			field?: FieldRow;
		};
		setBusy(false);
		if (!res.ok || !json.ok || !json.field) {
			setError(json.error || "Failed to add field");
			return;
		}
		setFields((prev) => [...prev, json.field!]);
		setDraft({
			key: "",
			label: "",
			fieldType: "text",
			required: false,
			helpText: "",
			visibilityOp: "always",
			visibilityFieldKey: "",
			visibilityValue: "",
			visibilityValues: "",
			options: defaultSelectOptions(),
			sectionKey: "",
			...emptyConfigDraft(),
		});
		router.refresh();
	}

	function startEdit(field: FieldRow) {
		setEditingId(field.id);
		setEditDraft({
			key: field.key,
			label: field.label,
			required: field.required,
			helpText: field.helpText ?? "",
			sectionKey: field.sectionKey ?? "",
			...visibilityDraftFromRule(field.visibilityRule),
			options: readSelectOptions(field.config),
			...configDraftFromField(field.config),
		});
	}

	function buildFieldConfig(
		fieldType: FieldType,
		options: SelectOption[],
		configDraft: ConfigDraft,
	): Record<string, unknown> {
		if (fieldType === "select" || fieldType === "multiselect") {
			return { kind: fieldType, options };
		}
		if (fieldType === "speaker_block") {
			return { kind: "speaker_block", minSpeakers: 1, maxSpeakers: 4 };
		}
		if (fieldType === "number") {
			const config: Record<string, unknown> = { kind: "number" };
			const min = optionalFiniteNumber(configDraft.numberMin);
			const max = optionalFiniteNumber(configDraft.numberMax);
			const step = optionalFiniteNumber(configDraft.numberStep);
			if (min !== undefined) config.min = min;
			if (max !== undefined) config.max = max;
			if (step !== undefined && step > 0) config.step = step;
			return config;
		}
		if (fieldType === "file_upload") {
			const config: Record<string, unknown> = { kind: "file_upload" };
			const accept = configDraft.uploadAccept.split(",").map((item) => item.trim()).filter(Boolean);
			if (accept.length) config.accept = accept;
			const maxMb = optionalPositiveInt(configDraft.uploadMaxMb);
			if (maxMb !== undefined) config.maxBytes = maxMb * 1024 * 1024;
			return config;
		}
		const config: Record<string, unknown> = { kind: fieldType };
		const placeholder = configDraft.placeholder.trim();
		if (placeholder) config.placeholder = placeholder;
		if (fieldType === "textarea") {
			config.rows = optionalPositiveInt(configDraft.rows) ?? 5;
		}
		if (fieldType === "text" || fieldType === "textarea") {
			const maxLength = optionalPositiveInt(configDraft.maxLength);
			if (maxLength !== undefined) config.maxLength = maxLength;
		}
		return config;
	}

	function configForFieldEdit(
		field: FieldRow,
		draft: ConfigDraft & { options: SelectOption[] },
	): Record<string, unknown> {
		return buildFieldConfig(field.fieldType, draft.options, draft);
	}

	async function saveFieldEdit(field: FieldRow) {
		if (!editDraft) return;
		setBusy(true);
		setError(null);
		const visibilityRule = buildVisibilityRule(editDraft);

		const res = await fetch(base, {
			method: "PATCH",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				fieldId: field.id,
				field: {
					key: editDraft.key.trim(),
					label: editDraft.label,
					fieldType: field.fieldType,
					required: editDraft.required,
					position: field.position,
					visibilityRule,
					config: configForFieldEdit(field, editDraft),
					helpText: editDraft.helpText.trim() || undefined,
					sectionKey: editDraft.sectionKey.trim() || null,
				},
			}),
		});
		const json = (await res.json()) as {
			ok?: boolean;
			error?: string;
			field?: FieldRow;
		};
		setBusy(false);
		if (!res.ok || !json.ok || !json.field) {
			setError(json.error || "Failed to update field");
			return;
		}
		setFields((prev) =>
			prev.map((f) =>
				f.id === field.id
					? { ...json.field!, config: json.field!.config ?? field.config }
					: f,
			),
		);
		setEditingId(null);
		setEditDraft(null);
		router.refresh();
	}

	async function removeField(fieldId: string) {
		setBusy(true);
		setError(null);
		const res = await fetch(`${base}?fieldId=${encodeURIComponent(fieldId)}`, {
			method: "DELETE",
		});
		const json = (await res.json()) as { ok?: boolean; error?: string };
		setBusy(false);
		if (!res.ok || !json.ok) {
			setError(json.error || "Failed to delete field");
			return;
		}
		setFields((prev) => prev.filter((f) => f.id !== fieldId));
		router.refresh();
	}

	async function reorderFields(ordered: FieldRow[]) {
		setFields(ordered);
		setBusy(true);
		const res = await fetch(base, {
			method: "PATCH",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				action: "reorder",
				orderedIds: ordered.map((f) => f.id),
			}),
		});
		setBusy(false);
		if (!res.ok) {
			setError("Reorder failed");
			setFields(fields);
			return;
		}
		router.refresh();
	}

	async function move(fieldId: string, dir: -1 | 1) {
		const index = fields.findIndex((f) => f.id === fieldId);
		const next = index + dir;
		if (index < 0 || next < 0 || next >= fields.length) return;
		const ordered = [...fields];
		const [item] = ordered.splice(index, 1);
		ordered.splice(next, 0, item!);
		await reorderFields(ordered);
	}

	function dropField(targetId: string) {
		if (!dragId || dragId === targetId) return;
		const from = fields.findIndex((field) => field.id === dragId);
		const to = fields.findIndex((field) => field.id === targetId);
		if (from < 0 || to < 0) return;
		const ordered = [...fields];
		const [item] = ordered.splice(from, 1);
		ordered.splice(to, 0, item!);
		setDragId(null);
		void reorderFields(ordered);
	}

	return (
		<div>
			<FormBuilderPreview
				title={title}
				description={description}
				sections={sections}
				fields={previewFields}
			/>

			<AdminSectionShell
				ariaLabel="Form builder sections"
				mobileLabel="Form section"
				sections={SECTIONS}
				section={section}
				onSectionChange={(next) => setSection(parseFormBuilderSection(next))}
				notice={
					error ? (
						<p aria-live="polite" role="alert" className={noticeClasses("negative")}>
							{error}
						</p>
					) : null
				}
			>
				{section === "settings" ? (
					<div className="space-y-3">
						<label className="block text-xs text-neutral-400">
							Title
							<input
								className="mt-1 w-full rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-100"
								value={title}
								onChange={(e) => setTitle(e.target.value)}
							/>
						</label>
						<div className="grid gap-3 sm:grid-cols-2">
							<label className="block text-xs text-neutral-400">
								Minimum speakers
								<input type="number" min={1} className="mt-1 w-full rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-100" value={minSpeakers} onChange={(e) => setMinSpeakers(Number(e.target.value))} />
							</label>
							<label className="block text-xs text-neutral-400">
								Maximum speakers
								<input type="number" min={minSpeakers || 1} className="mt-1 w-full rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-100" value={maxSpeakers} onChange={(e) => setMaxSpeakers(Number(e.target.value))} />
							</label>
						</div>
						<label className="block text-xs text-neutral-400">
							Submission limit <span className="text-neutral-500">(0 means unlimited)</span>
							<input type="number" min={0} className="mt-1 w-full rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-100" value={submissionLimit} onChange={(e) => setSubmissionLimit(Number(e.target.value))} />
						</label>
						<label className="flex items-center gap-2 text-xs text-neutral-300">
							<input type="checkbox" checked={draftsEnabled} onChange={(e) => setDraftsEnabled(e.target.checked)} />
							Allow submitters to save a draft and resume by email
						</label>
						<details className="rounded-md border border-neutral-800 bg-neutral-950/40 px-3 py-2 text-xs text-neutral-400">
							<summary className="cursor-pointer font-medium text-neutral-200">Email copy and reminders</summary>
							<p className="mt-2 text-neutral-500">Welcome copy is used for draft resume mail, confirmation copy for email, and thank-you copy after submit. Use {"{{event_name}}"}, {"{{submitter_name}}"}, {"{{title}}"}, and {"{{resume_url}}"}. Empty values use the default copy.</p>
							<label className="mt-3 block">Welcome copy<textarea className="mt-1 w-full rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-100" rows={3} value={welcomeCopy} onChange={(e) => setWelcomeCopy(e.target.value)} /></label>
							<label className="mt-3 block">Confirmation copy<textarea className="mt-1 w-full rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-100" rows={3} value={confirmationCopy} onChange={(e) => setConfirmationCopy(e.target.value)} /></label>
							<label className="mt-3 block">Speaker task reminder copy<textarea className="mt-1 w-full rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-100" rows={3} value={reminderCopy} onChange={(e) => setReminderCopy(e.target.value)} /></label>
							<label className="mt-3 block">Thank-you copy<textarea className="mt-1 w-full rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-100" rows={3} value={thankYouCopy} onChange={(e) => setThankYouCopy(e.target.value)} /></label>
						</details>
						<label className="block text-xs text-neutral-400">
							Description
							<textarea
								className="mt-1 w-full rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-100"
								rows={3}
								value={description}
								onChange={(e) => setDescription(e.target.value)}
							/>
						</label>
						<label className="block text-xs text-neutral-400">
							Status
							<select
								className="mt-1 w-full rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-100"
								value={status}
								onChange={(e) => setStatus(e.target.value)}
							>
								<option value="draft">draft</option>
								<option value="open">open</option>
								<option value="closed">closed</option>
							</select>
						</label>
						<div className="grid gap-3 sm:grid-cols-2">
							<label className="block text-xs text-neutral-400">
								Opens at (local)
								<input
									type="datetime-local"
									className="mt-1 w-full rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-100"
									value={opensAtInput}
									onChange={(e) => setOpensAtInput(e.target.value)}
								/>
							</label>
							<label className="block text-xs text-neutral-400">
								Closes at (local)
								<input
									type="datetime-local"
									className="mt-1 w-full rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-100"
									value={closesAtInput}
									onChange={(e) => setClosesAtInput(e.target.value)}
								/>
							</label>
						</div>
						<p className="text-xs text-neutral-500">
							Set a close date to enable draft reminder emails for unsubmitted drafts in the final 72 hours.
						</p>
						<details className="rounded-md border border-neutral-800 bg-neutral-950/40 px-3 py-2 text-xs text-neutral-400">
							<summary className="cursor-pointer font-medium text-neutral-200">Category routing</summary>
							<p className="mt-2 text-neutral-500">Route a select answer to an organizer category. Leave both fields blank for no category.</p>
							<label className="mt-3 block">Select field key
								<select className="mt-1 w-full rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-100" value={categoryFieldKey} onChange={(e) => setCategoryFieldKey(e.target.value)}>
									<option value="">No category routing</option>
									{fields.filter((field) => field.fieldType === "select").map((field) => <option key={field.id} value={field.key}>{field.key}</option>)}
								</select>
							</label>
							<label className="mt-3 block">Value = category
								<textarea className="mt-1 w-full rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-100" rows={4} placeholder={"stage = Stage\nworkshop = Workshop"} value={categoryMapText} onChange={(e) => setCategoryMapText(e.target.value)} />
							</label>
						</details>
						<div>
							<Button type="button" disabled={busy} onClick={() => void saveMeta()}>
								Save settings
							</Button>
						</div>
					</div>
				) : null}

				{section === "sections" ? (
					<div className="space-y-3">
						<SectionsEditor sections={sections} onChange={setSections} />
						<div>
							<Button type="button" disabled={busy} onClick={() => void saveMeta()}>
								Save sections
							</Button>
						</div>
					</div>
				) : null}

				{section === "fields" ? (
					<ol className="divide-y divide-neutral-800 border-y border-neutral-800">
						{fields.map((field, index) => (
							<li
								key={field.id}
								className={`py-3 ${dragId === field.id ? "bg-neutral-900/60" : ""}`}
								draggable={!busy && editingId !== field.id}
								onDragStart={() => setDragId(field.id)}
								onDragEnd={() => setDragId(null)}
								onDragOver={(event) => event.preventDefault()}
								onDrop={() => dropField(field.id)}
							>
								{editingId === field.id && editDraft ? (
									<div className="space-y-3">
										<label className="block text-xs text-neutral-400">
											Key
											<input
												className="mt-1 w-full rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 disabled:opacity-50"
												value={editDraft.key}
												disabled={!canEditKeys}
												onChange={(e) =>
													setEditDraft((d) =>
														d ? { ...d, key: e.target.value } : d,
													)
												}
											/>
										</label>
										{!canEditKeys ? (
											<p className="text-xs text-neutral-500">Keys lock after the first submission to preserve answers.</p>
										) : (
											<p className="text-xs text-neutral-500">
												Key <code className="text-neutral-400">{field.key}</code> · {field.fieldType}
											</p>
										)}
										<label className="block text-xs text-neutral-400">
											Label
											<input
												className="mt-1 w-full rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-100"
												value={editDraft.label}
												onChange={(e) =>
													setEditDraft((d) =>
														d ? { ...d, label: e.target.value } : d,
													)
												}
											/>
										</label>
										<label className="block text-xs text-neutral-400">
											Help text
											<input
												className="mt-1 w-full rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-100"
												value={editDraft.helpText}
												onChange={(e) =>
													setEditDraft((d) =>
														d ? { ...d, helpText: e.target.value } : d,
													)
												}
											/>
										</label>
										<label className="flex items-center gap-2 text-xs text-neutral-300">
											<input
												type="checkbox"
												checked={editDraft.required}
												onChange={(e) =>
													setEditDraft((d) =>
														d ? { ...d, required: e.target.checked } : d,
													)
												}
											/>
											Required
										</label>
										<SectionSelect
											sections={sections}
											value={editDraft.sectionKey}
											onChange={(sectionKey) =>
												setEditDraft((d) => (d ? { ...d, sectionKey } : d))
											}
										/>
										<VisibilityFields
											op={editDraft.visibilityOp}
											fieldKey={editDraft.visibilityFieldKey}
											value={editDraft.visibilityValue}
											values={editDraft.visibilityValues}
											siblingKeys={fields
												.filter((f) => f.id !== field.id && f.fieldType === "select")
												.map((f) => f.key)}
											onChange={(next) =>
												setEditDraft((d) => (d ? { ...d, ...next } : d))
											}
										/>
										{field.fieldType === "select" ||
										field.fieldType === "multiselect" ? (
											<OptionsEditor
												options={editDraft.options}
												onChange={(options) =>
													setEditDraft((d) => (d ? { ...d, options } : d))
												}
											/>
										) : null}
										<FieldConfigFields
											fieldType={field.fieldType}
											draft={editDraft}
											onChange={(patch) =>
												setEditDraft((d) => (d ? { ...d, ...patch } : d))
											}
										/>
										<div className="flex gap-2">
											<Button
												type="button"
												disabled={busy}
												onClick={() => void saveFieldEdit(field)}
											>
												Save field
											</Button>
											<button
												type="button"
												className="text-xs text-neutral-400"
												onClick={() => {
													setEditingId(null);
													setEditDraft(null);
												}}
											>
												Cancel
											</button>
										</div>
									</div>
								) : (
									<div className="flex flex-wrap items-center justify-between gap-3">
										<div className="min-w-0">
											<p className="font-medium text-neutral-100">
												<span className="mr-2 cursor-grab text-neutral-500" aria-hidden="true">⋮⋮</span>
												{field.label}
											</p>
											<p className="text-xs text-neutral-500">
												{field.key} · {field.fieldType}
												{field.sectionKey ? ` · section ${field.sectionKey}` : ""}
												{field.required ? " · required" : ""}
												{field.helpText ? " · has help" : ""}
												{" · "}
												{visibilitySummary(field.visibilityRule)}
											</p>
										</div>
										<div className="flex items-center gap-2">
											<button
												type="button"
												disabled={busy}
												onClick={() => startEdit(field)}
												className="rounded-md border border-neutral-700 px-2 py-1 text-xs text-neutral-300"
											>
												Edit
											</button>
											<button
												type="button"
												disabled={busy || index === 0}
												onClick={() => void move(field.id, -1)}
												className="rounded-md border border-neutral-700 px-2 py-1 text-xs text-neutral-300 disabled:opacity-40"
											>
												Up
											</button>
											<button
												type="button"
												disabled={busy || index === fields.length - 1}
												onClick={() => void move(field.id, 1)}
												className="rounded-md border border-neutral-700 px-2 py-1 text-xs text-neutral-300 disabled:opacity-40"
											>
												Down
											</button>
											<button
												type="button"
												disabled={busy}
												onClick={() => void removeField(field.id)}
												className="rounded-md border border-red-900/60 px-2 py-1 text-xs text-red-300"
											>
												Remove
											</button>
										</div>
									</div>
								)}
							</li>
						))}
					</ol>
				) : null}

				{section === "add-field" ? (
					<div className="space-y-3">
						<div className="grid gap-3 sm:grid-cols-2">
							<label className="block text-xs text-neutral-400">
								Key
								<input
									className="mt-1 w-full rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-100"
									placeholder="duration_minutes"
									value={draft.key}
									onChange={(e) => setDraft((d) => ({ ...d, key: e.target.value }))}
								/>
							</label>
							<label className="block text-xs text-neutral-400">
								Label
								<input
									className="mt-1 w-full rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-100"
									placeholder="Duration (minutes)"
									value={draft.label}
									onChange={(e) =>
										setDraft((d) => ({ ...d, label: e.target.value }))
									}
								/>
							</label>
							<label className="block text-xs text-neutral-400">
								Type
								<select
									className="mt-1 w-full rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-100"
									value={draft.fieldType}
									onChange={(e) =>
										setDraft((d) => ({
											...d,
											fieldType: e.target.value as FieldType,
										}))
									}
								>
									{FIELD_TYPES.map((type) => (
										<option key={type} value={type}>
											{type}
										</option>
									))}
								</select>
							</label>
							<label className="flex items-end gap-2 pb-2 text-xs text-neutral-300">
								<input
									type="checkbox"
									checked={draft.required}
									onChange={(e) =>
										setDraft((d) => ({ ...d, required: e.target.checked }))
									}
								/>
								Required
							</label>
							<SectionSelect
								sections={sections}
								value={draft.sectionKey}
								onChange={(sectionKey) => setDraft((d) => ({ ...d, sectionKey }))}
							/>
							<label className="block text-xs text-neutral-400 sm:col-span-2">
								Help text
								<input
									className="mt-1 w-full rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-100"
									value={draft.helpText}
									onChange={(e) =>
										setDraft((d) => ({ ...d, helpText: e.target.value }))
									}
								/>
							</label>
							<div className="space-y-2 sm:col-span-2">
								<VisibilityFields
									op={draft.visibilityOp}
									fieldKey={draft.visibilityFieldKey}
									value={draft.visibilityValue}
									values={draft.visibilityValues}
									siblingKeys={visibilitySourceKeys}
									onChange={(next) => setDraft((d) => ({ ...d, ...next }))}
								/>
							</div>
						</div>
						{draft.fieldType === "select" || draft.fieldType === "multiselect" ? (
							<OptionsEditor
								options={draft.options}
								onChange={(options) => setDraft((d) => ({ ...d, options }))}
							/>
						) : null}
						<FieldConfigFields
							fieldType={draft.fieldType}
							draft={draft}
							onChange={(patch) => setDraft((d) => ({ ...d, ...patch }))}
						/>
						<div>
							<Button type="button" disabled={busy} onClick={() => void addField()}>
								Add field
							</Button>
						</div>
					</div>
				) : null}
			</AdminSectionShell>
		</div>
	);
}

function FieldConfigFields({
	fieldType,
	draft,
	onChange,
}: {
	fieldType: FieldType;
	draft: ConfigDraft;
	onChange: (patch: Partial<ConfigDraft>) => void;
}) {
	const showsPlaceholder =
		fieldType === "text" ||
		fieldType === "textarea" ||
		fieldType === "url" ||
		fieldType === "video" ||
		fieldType === "email";
	const showsMaxLength = fieldType === "text" || fieldType === "textarea";
	const showsRows = fieldType === "textarea";
	const showsNumber = fieldType === "number";
	const showsUpload = fieldType === "file_upload";
	if (!showsPlaceholder && !showsMaxLength && !showsRows && !showsNumber && !showsUpload) return null;

	return (
		<div className="grid gap-3 sm:grid-cols-2">
			{showsPlaceholder ? (
				<label className="block text-xs text-neutral-400 sm:col-span-2">
					Placeholder
					<input
						className="mt-1 w-full rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-100"
						value={draft.placeholder}
						onChange={(e) => onChange({ placeholder: e.target.value })}
					/>
				</label>
			) : null}
			{showsMaxLength ? (
				<label className="block text-xs text-neutral-400">
					Max length
					<input
						type="number"
						min={1}
						className="mt-1 w-full rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-100"
						value={draft.maxLength}
						onChange={(e) => onChange({ maxLength: e.target.value })}
					/>
				</label>
			) : null}
			{showsRows ? (
				<label className="block text-xs text-neutral-400">
					Rows
					<input
						type="number"
						min={1}
						className="mt-1 w-full rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-100"
						value={draft.rows}
						placeholder="5"
						onChange={(e) => onChange({ rows: e.target.value })}
					/>
				</label>
			) : null}
			{showsNumber ? (
				<>
					<label className="block text-xs text-neutral-400">
						Min
						<input
							type="number"
							className="mt-1 w-full rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-100"
							value={draft.numberMin}
							onChange={(e) => onChange({ numberMin: e.target.value })}
						/>
					</label>
					<label className="block text-xs text-neutral-400">
						Max
						<input
							type="number"
							className="mt-1 w-full rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-100"
							value={draft.numberMax}
							onChange={(e) => onChange({ numberMax: e.target.value })}
						/>
					</label>
					<label className="block text-xs text-neutral-400">
						Step
						<input
							type="number"
							min={0}
							step="any"
							className="mt-1 w-full rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-100"
							value={draft.numberStep}
							onChange={(e) => onChange({ numberStep: e.target.value })}
						/>
					</label>
				</>
			) : null}
			{showsUpload ? (
				<>
					<label className="block text-xs text-neutral-400 sm:col-span-2">
						Accepted types (comma-separated MIME or patterns)
						<input
							className="mt-1 w-full rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-100"
							placeholder="application/pdf, image/*"
							value={draft.uploadAccept}
							onChange={(e) => onChange({ uploadAccept: e.target.value })}
						/>
					</label>
					<label className="block text-xs text-neutral-400">
						Max size (MB)
						<input
							type="number"
							min={1}
							max={25}
							className="mt-1 w-full rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-100"
							placeholder="10"
							value={draft.uploadMaxMb}
							onChange={(e) => onChange({ uploadMaxMb: e.target.value })}
						/>
					</label>
				</>
			) : null}
		</div>
	);
}

function SectionSelect({
	sections,
	value,
	onChange,
}: {
	sections: FormSection[];
	value: string;
	onChange: (value: string) => void;
}) {
	if (!sections.length) return null;
	return (
		<label className="block text-xs text-neutral-400">
			Section
			<select
				className="mt-1 w-full rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-100"
				value={value}
				onChange={(e) => onChange(e.target.value)}
			>
				<option value="">No section</option>
				{sections.map((section) => (
					<option key={section.key} value={section.key}>
						{section.title}
					</option>
				))}
			</select>
		</label>
	);
}

function SectionsEditor({
	sections,
	onChange,
}: {
	sections: FormSection[];
	onChange: (sections: FormSection[]) => void;
}) {
	return (
		<div className="space-y-2">
			{sections.map((section, index) => (
				<div key={section.key || index} className="grid gap-2 border-b border-neutral-800 py-3 sm:grid-cols-2">
					<label className="block text-xs text-neutral-400">
						Key
						<input
							className="mt-1 w-full rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-100"
							value={section.key}
							onChange={(e) => {
								const next = [...sections];
								next[index] = { ...section, key: e.target.value };
								onChange(next);
							}}
						/>
					</label>
					<label className="block text-xs text-neutral-400">
						Title
						<input
							className="mt-1 w-full rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-100"
							value={section.title}
							onChange={(e) => {
								const next = [...sections];
								next[index] = { ...section, title: e.target.value };
								onChange(next);
							}}
						/>
					</label>
					<label className="block text-xs text-neutral-400 sm:col-span-2">
						Description
						<input
							className="mt-1 w-full rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-100"
							value={section.description ?? ""}
							onChange={(e) => {
								const next = [...sections];
								next[index] = { ...section, description: e.target.value };
								onChange(next);
							}}
						/>
					</label>
					<button
						type="button"
						className="justify-self-start text-xs text-red-300"
						onClick={() => onChange(sections.filter((_, i) => i !== index))}
					>
						Remove section
					</button>
				</div>
			))}
			<button
				type="button"
				className="text-xs text-emerald-400"
				onClick={() =>
					onChange([
						...sections,
						{ key: `section_${sections.length + 1}`, title: "New section" },
					])
				}
			>
				+ Add section
			</button>
		</div>
	);
}

function rowToPreviewField(field: FieldRow): FormFieldDef {
	return {
		key: field.key,
		label: field.label,
		fieldType: field.fieldType,
		required: field.required,
		position: field.position,
		visibilityRule: field.visibilityRule,
		config: field.config as FormFieldDef["config"],
		helpText: field.helpText,
		sectionKey: field.sectionKey ?? null,
	};
}

function OptionsEditor({
	options,
	onChange,
}: {
	options: SelectOption[];
	onChange: (options: SelectOption[]) => void;
}) {
	return (
		<div className="space-y-2">
			<p className="text-xs font-medium text-neutral-400">Options</p>
			{options.map((opt, i) => (
				<div key={i} className="flex flex-wrap gap-2">
					<input
						className="min-w-0 flex-1 rounded-md border border-neutral-700 bg-neutral-950 px-2 py-1 text-xs text-neutral-100"
						placeholder="value"
						value={opt.value}
						onChange={(e) => {
							const next = [...options];
							next[i] = { ...opt, value: e.target.value };
							onChange(next);
						}}
					/>
					<input
						className="min-w-0 flex-1 rounded-md border border-neutral-700 bg-neutral-950 px-2 py-1 text-xs text-neutral-100"
						placeholder="label"
						value={opt.label}
						onChange={(e) => {
							const next = [...options];
							next[i] = { ...opt, label: e.target.value };
							onChange(next);
						}}
					/>
					<button
						type="button"
						className="text-xs text-red-300"
						onClick={() => onChange(options.filter((_, j) => j !== i))}
					>
						Remove
					</button>
				</div>
			))}
			<button
				type="button"
				className="text-xs text-emerald-400"
				onClick={() =>
					onChange([
						...options,
						{ value: `option_${options.length + 1}`, label: "New option" },
					])
				}
			>
				+ Add option
			</button>
		</div>
	);
}
