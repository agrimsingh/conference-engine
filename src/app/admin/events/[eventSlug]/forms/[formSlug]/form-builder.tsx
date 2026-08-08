"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui";
import { FIELD_TYPES, type FieldType } from "@/lib/domain";

type FieldRow = {
	id: string;
	key: string;
	label: string;
	fieldType: FieldType;
	required: boolean;
	position: number;
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
	initialStatus: string;
	initialFields: FieldRow[];
};

export function FormBuilder({
	eventSlug,
	formSlug,
	initialTitle,
	initialStatus,
	initialFields,
}: Props) {
	const router = useRouter();
	const [title, setTitle] = useState(initialTitle);
	const [status, setStatus] = useState(initialStatus);
	const [fields, setFields] = useState(initialFields);
	const [error, setError] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);
	const [draft, setDraft] = useState({
		key: "",
		label: "",
		fieldType: "text" as FieldType,
		required: false,
	});

	const base = `/api/admin/events/${eventSlug}/forms/${formSlug}/fields`;

	async function saveMeta() {
		setBusy(true);
		setError(null);
		const res = await fetch(`/api/admin/events/${eventSlug}/forms`, {
			method: "PATCH",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ formSlug, title, status }),
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
		const config =
			draft.fieldType === "select" || draft.fieldType === "multiselect"
				? {
						kind: draft.fieldType,
						options: [
							{ value: "option_a", label: "Option A" },
							{ value: "option_b", label: "Option B" },
						],
					}
				: draft.fieldType === "textarea"
					? { kind: "textarea", rows: 5 }
					: draft.fieldType === "number"
						? { kind: "number" }
						: draft.fieldType === "speaker_block"
							? { kind: "speaker_block", minSpeakers: 1, maxSpeakers: 4 }
							: { kind: draft.fieldType };

		const res = await fetch(base, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				key: draft.key,
				label: draft.label,
				fieldType: draft.fieldType,
				required: draft.required,
				position,
				visibilityRule: { op: "always" },
				config,
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
		setDraft({ key: "", label: "", fieldType: "text", required: false });
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
				<Button type="button" disabled={busy} onClick={() => void saveMeta()}>
					Save settings
				</Button>
			</section>

			<section className="space-y-3">
				<h2 className="text-sm font-medium text-neutral-200">Fields</h2>
				<ol className="divide-y divide-neutral-800 rounded-lg border border-neutral-800 bg-neutral-900">
					{fields.map((field, index) => (
						<li
							key={field.id}
							className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
						>
							<div className="min-w-0">
								<p className="font-medium text-neutral-100">{field.label}</p>
								<p className="text-xs text-neutral-500">
									{field.key} · {field.fieldType}
									{field.required ? " · required" : ""}
									{field.visibilityRule.op !== "always"
										? ` · visible when ${field.visibilityRule.op}`
										: ""}
								</p>
							</div>
							<div className="flex items-center gap-2">
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
				</div>
				<p className="text-xs text-neutral-500">
					Select fields get Option A/B placeholders; edit config in D1 or a
					follow-up for full option editors.
				</p>
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
