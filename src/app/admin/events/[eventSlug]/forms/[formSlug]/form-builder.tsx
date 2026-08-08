"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui";
import { FIELD_TYPES, type FieldType } from "@/lib/domain";

import type { SelectOption } from "@/lib/domain/form-fields";

type FieldRow = {
	id: string;
	key: string;
	label: string;
	fieldType: FieldType;
	required: boolean;
	position: number;
	helpText?: string;
	visibilityRule: {
		op: string;
		fieldKey?: string;
		value?: string;
		values?: string[];
	};
	config: Record<string, unknown>;
};

type Props = {
	eventSlug: string;
	formSlug: string;
	initialTitle: string;
	initialDescription: string;
	initialStatus: string;
	initialClosesAt: number | null;
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

function closesAtInputValue(ms: number | null): string {
	if (ms == null) return "";
	const d = new Date(ms);
	const pad = (n: number) => String(n).padStart(2, "0");
	return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function parseClosesAtInput(value: string): number | null {
	const trimmed = value.trim();
	if (!trimmed) return null;
	const ms = Date.parse(trimmed);
	return Number.isFinite(ms) ? ms : null;
}

type VisibilityOp = "always" | "eq";

type VisibilityDraft = {
	visibilityOp: VisibilityOp;
	visibilityFieldKey: string;
	visibilityValue: string;
};

function buildVisibilityRule(draft: VisibilityDraft): {
	op: "always";
} | {
	op: "eq";
	fieldKey: string;
	value: string;
} {
	if (
		draft.visibilityOp === "eq" &&
		draft.visibilityFieldKey.trim() &&
		draft.visibilityValue.trim()
	) {
		return {
			op: "eq",
			fieldKey: draft.visibilityFieldKey.trim(),
			value: draft.visibilityValue.trim(),
		};
	}
	return { op: "always" };
}

function visibilitySummary(rule: FieldRow["visibilityRule"]): string {
	if (rule.op === "eq" && rule.fieldKey && rule.value != null) {
		return `visible when ${rule.fieldKey} = ${rule.value}`;
	}
	if (rule.op === "in" && rule.fieldKey && rule.values?.length) {
		return `visible when ${rule.fieldKey} in [${rule.values.join(", ")}]`;
	}
	if (rule.op === "always") return "always visible";
	return `visible when ${rule.op}`;
}

function VisibilityFields({
	op,
	fieldKey,
	value,
	siblingKeys,
	onChange,
}: {
	op: VisibilityOp;
	fieldKey: string;
	value: string;
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
						})
					}
				>
					<option value="always">Always</option>
					<option value="eq">Equals</option>
				</select>
			</label>
			{op === "eq" ? (
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
									})
								}
							/>
						)}
					</label>
					<label className="block text-xs text-neutral-400">
						Value
						<input
							className="mt-1 w-full rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-100"
							placeholder="value"
							value={value}
							onChange={(e) =>
								onChange({
									visibilityOp: op,
									visibilityFieldKey: fieldKey,
									visibilityValue: e.target.value,
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
	initialTitle,
	initialDescription,
	initialStatus,
	initialClosesAt,
	initialFields,
}: Props) {
	const router = useRouter();
	const [title, setTitle] = useState(initialTitle);
	const [description, setDescription] = useState(initialDescription);
	const [status, setStatus] = useState(initialStatus);
	const [closesAtInput, setClosesAtInput] = useState(
		closesAtInputValue(initialClosesAt),
	);
	const [fields, setFields] = useState(initialFields);
	const [editingId, setEditingId] = useState<string | null>(null);
	const [editDraft, setEditDraft] = useState<{
		label: string;
		required: boolean;
		helpText: string;
		visibilityOp: "always" | "eq";
		visibilityFieldKey: string;
		visibilityValue: string;
		options: SelectOption[];
	} | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);
	const [draft, setDraft] = useState({
		key: "",
		label: "",
		fieldType: "text" as FieldType,
		required: false,
		helpText: "",
		visibilityOp: "always" as VisibilityOp,
		visibilityFieldKey: "",
		visibilityValue: "",
		options: defaultSelectOptions(),
	});

	const base = `/api/admin/events/${eventSlug}/forms/${formSlug}/fields`;
	const siblingKeysForAdd = fields.map((f) => f.key);

	async function saveMeta() {
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
				closesAt: parseClosesAtInput(closesAtInput),
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
		const config = buildFieldConfig(draft.fieldType, draft.options);
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
			options: defaultSelectOptions(),
		});
		router.refresh();
	}

	function startEdit(field: FieldRow) {
		setEditingId(field.id);
		setEditDraft({
			label: field.label,
			required: field.required,
			helpText: field.helpText ?? "",
			visibilityOp: field.visibilityRule.op === "eq" ? "eq" : "always",
			visibilityFieldKey: field.visibilityRule.fieldKey ?? "",
			visibilityValue: field.visibilityRule.value ?? "",
			options: readSelectOptions(field.config),
		});
	}

	function buildFieldConfig(
		fieldType: FieldType,
		options: SelectOption[],
	): Record<string, unknown> {
		if (fieldType === "select" || fieldType === "multiselect") {
			return { kind: fieldType, options };
		}
		if (fieldType === "textarea") return { kind: "textarea", rows: 5 };
		if (fieldType === "number") return { kind: "number" };
		if (fieldType === "speaker_block") {
			return { kind: "speaker_block", minSpeakers: 1, maxSpeakers: 4 };
		}
		return { kind: fieldType };
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
					key: field.key,
					label: editDraft.label,
					fieldType: field.fieldType,
					required: editDraft.required,
					position: field.position,
					visibilityRule,
					config: buildFieldConfig(field.fieldType, editDraft.options),
					helpText: editDraft.helpText.trim() || undefined,
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

	async function move(fieldId: string, dir: -1 | 1) {
		const index = fields.findIndex((f) => f.id === fieldId);
		const next = index + dir;
		if (index < 0 || next < 0 || next >= fields.length) return;
		const ordered = [...fields];
		const [item] = ordered.splice(index, 1);
		ordered.splice(next, 0, item!);
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

	return (
		<div className="space-y-8">
			<section className="space-y-3 rounded-lg border border-neutral-800 bg-neutral-900 p-4">
				<h2 className="text-sm font-medium text-neutral-200">Form settings</h2>
				<label className="block text-xs text-neutral-400">
					Title
					<input
						className="mt-1 w-full rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-100"
						value={title}
						onChange={(e) => setTitle(e.target.value)}
					/>
				</label>
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
				<label className="block text-xs text-neutral-400">
					Closes at (local)
					<input
						type="datetime-local"
						className="mt-1 w-full rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-100"
						value={closesAtInput}
						onChange={(e) => setClosesAtInput(e.target.value)}
					/>
				</label>
				<Button type="button" disabled={busy} onClick={() => void saveMeta()}>
					Save settings
				</Button>
			</section>

			<section className="space-y-3">
				<h2 className="text-sm font-medium text-neutral-200">Fields</h2>
				<ol className="divide-y divide-neutral-800 rounded-lg border border-neutral-800 bg-neutral-900">
					{fields.map((field, index) => (
						<li key={field.id} className="px-4 py-3">
							{editingId === field.id && editDraft ? (
								<div className="space-y-3">
									<p className="text-xs text-neutral-500">
										Key <code className="text-neutral-400">{field.key}</code> ·{" "}
										{field.fieldType} (immutable)
									</p>
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
									<VisibilityFields
										op={editDraft.visibilityOp}
										fieldKey={editDraft.visibilityFieldKey}
										value={editDraft.visibilityValue}
										siblingKeys={fields
											.filter((f) => f.id !== field.id)
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
										<p className="font-medium text-neutral-100">{field.label}</p>
										<p className="text-xs text-neutral-500">
											{field.key} · {field.fieldType}
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
			</section>

			<section className="space-y-3 rounded-lg border border-neutral-800 bg-neutral-900 p-4">
				<h2 className="text-sm font-medium text-neutral-200">Add field</h2>
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
							siblingKeys={siblingKeysForAdd}
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
				<Button type="button" disabled={busy} onClick={() => void addField()}>
					Add field
				</Button>
			</section>

			{error ? (
				<p className="text-sm text-red-300" role="alert">
					{error}
				</p>
			) : null}
		</div>
	);
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
