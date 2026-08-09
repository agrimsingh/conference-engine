"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
	buttonClasses,
	INPUT_CLASSES,
	noticeClasses,
	StatusPill,
} from "@/components/ui";
import { formatUtcTimestamp, isTaskOverdue, taskDueLabel } from "@/lib/speakers/task-display";
import type { TaskFormField } from "@/lib/speakers/task-forms";

export type TaskView = {
	id: string;
	key: string;
	label: string;
	kind: "text" | "file" | "form";
	formFields?: TaskFormField[] | null;
	status: "pending" | "completed";
	accept: readonly string[];
	textValue: string | null;
	assetId: string | null;
	required: boolean;
	instructions?: string | null;
	dueAt?: number | null;
	versions?: Array<{ id: string; versionNumber: number; filename: string | null; sizeBytes: number; createdAt: number }>;
	comments?: Array<{ id: string; authorName: string; authorKind: string; body: string; createdAt: number }>;
};

type Props = {
	tasks: TaskView[];
	compact?: boolean;
	readOnly?: boolean;
	timeZone?: string;
};

export function textTaskRules(key: string): { minLength: number | undefined; hint: string } {
	return key === "bio" ? { minLength: 20, hint: " (20+ characters)" } : { minLength: undefined, hint: "" };
}

export function TaskChecklist({ tasks, compact = false, readOnly = false, timeZone }: Props) {
	const router = useRouter();
	const [message, setMessage] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [busyId, setBusyId] = useState<string | null>(null);
	const [now] = useState(() => Date.now());

	async function completeTextTask(taskId: string, label: string, text: string) {
		setBusyId(taskId);
		setError(null);
		setMessage(null);
		try {
			const response = await fetch(`/api/portal/tasks/${taskId}/complete`, {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ text }),
			});
			const data = (await response.json()) as { ok?: boolean; error?: string };
			if (!response.ok || !data.ok) {
				setError(data.error ?? `Failed to save ${label}`);
				return;
			}
			setMessage(`${label} saved`);
			router.refresh();
		} catch {
			setError("Network error");
		} finally {
			setBusyId(null);
		}
	}

	async function uploadFile(taskId: string, file: File) {
		setBusyId(taskId);
		setError(null);
		setMessage(null);
		try {
			const form = new FormData();
			form.set("file", file);
			const response = await fetch(`/api/portal/tasks/${taskId}/upload`, {
				method: "POST",
				body: form,
			});
			const data = (await response.json()) as { ok?: boolean; error?: string };
			if (!response.ok || !data.ok) {
				setError(data.error ?? "Upload failed");
				return;
			}
			setMessage("Upload complete");
			router.refresh();
		} catch {
			setError("Network error");
		} finally {
			setBusyId(null);
		}
	}

	async function completeForm(taskId: string, label: string, form: HTMLFormElement, fields: TaskFormField[]) {
		const data = new FormData(form);
		const answers: Record<string, unknown> = {};
		for (const field of fields) {
			if (field.type === "multiselect") answers[field.key] = data.getAll(field.key).map(String);
			else answers[field.key] = data.get(field.key) ?? "";
		}
		setBusyId(taskId); setError(null); setMessage(null);
		try {
			const response = await fetch(`/api/portal/tasks/${taskId}/complete`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ answers }) });
			const result = await response.json() as { ok?: boolean; error?: string };
			if (!response.ok || !result.ok) setError(result.error ?? `Failed to save ${label}`);
			else { setMessage(`${label} saved`); router.refresh(); }
		} catch { setError("Network error"); } finally { setBusyId(null); }
	}

	async function addComment(taskId: string, body: string) {
		setBusyId(taskId); setError(null); setMessage(null);
		try {
			const response = await fetch(`/api/portal/tasks/${taskId}/comments`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ body }) });
			const data = await response.json() as { ok?: boolean; error?: string };
			if (!response.ok || !data.ok) setError(data.error ?? "Comment failed");
			else { setMessage("Comment added"); router.refresh(); }
		} catch { setError("Network error"); } finally { setBusyId(null); }
	}

	return (
		<div className="space-y-4">
			{message ? <p className={noticeClasses("positive")}>{message}</p> : null}
			{error ? <p className={noticeClasses("negative")}>{error}</p> : null}
			<ul className="space-y-3">
				{tasks.map((task) => {
					const done = task.status === "completed";
					const bioRules = textTaskRules(task.key);
					const overdue = isTaskOverdue({ dueAt: task.dueAt, status: task.status, now });
					const dueLabel = taskDueLabel({ dueAt: task.dueAt, status: task.status, now, timeZone });
					return (
						<li
							key={task.id}
							className={`${compact ? "border-t border-neutral-800 py-3 first:border-t-0" : "rounded-lg border border-neutral-800 bg-neutral-900 px-4 py-3"} text-sm ${overdue ? "border-red-900/80 bg-red-950/20" : ""}`}
						>
							<div className="flex flex-wrap items-baseline justify-between gap-2">
								<p className="font-medium text-neutral-100">{task.label}</p>
								<StatusPill tone={done ? "positive" : overdue ? "negative" : task.required ? "warning" : "neutral"}>
									{done ? "Done" : overdue ? "Overdue" : task.required ? "To do" : "Optional"}
								</StatusPill>
							</div>
							{dueLabel ? <p className={`mt-1 text-xs ${overdue ? "text-red-300" : "text-neutral-500"}`}>{dueLabel}</p> : null}
							{task.instructions ? <p className="mt-2 whitespace-pre-wrap text-xs leading-5 text-neutral-400">{task.instructions}</p> : null}

							{readOnly ? (
								<p className="mt-3 text-xs text-neutral-500">Demo tasks are read-only{task.textValue ? ` · ${task.textValue}` : ""}{task.assetId ? " · file uploaded" : ""}</p>
							) : task.kind === "text" ? (
								<form
									className="mt-3 space-y-2"
									onSubmit={(event) => {
										event.preventDefault();
										const form = new FormData(event.currentTarget);
										const text = String(form.get("text") ?? "");
										void completeTextTask(task.id, task.label, text);
									}}
								>
										<textarea
										name="text"
										required
										minLength={bioRules.minLength}
										maxLength={10000}
										rows={4}
										className={`w-full ${INPUT_CLASSES}`}
											placeholder={`Write your ${task.label.toLowerCase()}${bioRules.hint}`}
											defaultValue={task.textValue ?? ""}
									/>
									<button
										type="submit"
										disabled={busyId === task.id}
										className={buttonClasses("secondary")}
									>
										{busyId === task.id ? "Saving…" : done ? `Update ${task.label}` : `Save ${task.label}`}
									</button>
								</form>
							) : task.kind === "form" && task.formFields ? (
								<form className="mt-3 space-y-4" onSubmit={(event) => { event.preventDefault(); void completeForm(task.id, task.label, event.currentTarget, task.formFields!); }}>
									{task.formFields.map((field) => <TaskFormInput key={field.key} field={field} value={savedFormAnswer(task.textValue, field.key)} />)}
									<button type="submit" disabled={busyId === task.id} className={buttonClasses("secondary")}>{busyId === task.id ? "Saving…" : done ? `Update ${task.label}` : `Save ${task.label}`}</button>
								</form>
							) : (
								<form
									className="mt-3 space-y-2"
									onSubmit={(event) => {
										event.preventDefault();
										const form = new FormData(event.currentTarget);
										const file = form.get("file");
										if (file instanceof File) {
											void uploadFile(task.id, file);
										}
									}}
								>
									<label className="flex cursor-pointer flex-col gap-1 rounded-md border border-dashed border-neutral-700 bg-neutral-950/60 px-3 py-4 text-sm hover:border-neutral-500">
										<span className="font-medium text-neutral-200">
											Choose a file to upload
										</span>
										<span className="text-xs text-neutral-500">
											{task.accept.length
												? `Accepted: ${task.accept.join(", ")} · maximum 25 MB`
												: "Any file type · maximum 25 MB"}
										</span>
										<input
											type="file"
											name="file"
											required
											accept={task.accept.join(",")}
											className="mt-1 block w-full text-sm text-neutral-400 file:mr-3 file:rounded-md file:border-0 file:bg-neutral-800 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-neutral-100"
										/>
									</label>
										<button
										type="submit"
										disabled={busyId === task.id}
										className={buttonClasses("secondary")}
									>
											{busyId === task.id ? "Uploading…" : done ? "Replace file" : "Upload"}
									</button>
								</form>
							)}
							{task.kind === "file" && (task.versions?.length ?? 0) > 0 ? (
								<div className="mt-4 border-t border-neutral-800 pt-3">
									<p className="text-xs font-medium uppercase tracking-wide text-neutral-500">File versions ({task.versions!.length})</p>
									<ul className="mt-2 space-y-1 text-xs text-neutral-400">{task.versions!.map((version, index) => <li key={version.id} className="flex flex-wrap items-center justify-between gap-2"><span>v{version.versionNumber} · {version.filename ?? "upload"} · {formatUtcTimestamp(version.createdAt)} {index === 0 ? "· Latest" : ""}</span><a className="underline underline-offset-2 hover:text-white" href={`/api/portal/tasks/${task.id}/versions/${version.id}`}>Download</a></li>)}</ul>
									{task.comments?.length ? <ul className="mt-3 space-y-2">{task.comments.map((comment) => <li key={comment.id} className="rounded bg-neutral-950 px-3 py-2 text-xs"><p className="text-neutral-300">{comment.authorName} · {formatUtcTimestamp(comment.createdAt)}</p><p className="mt-1 whitespace-pre-wrap text-neutral-400">{comment.body}</p></li>)}</ul> : <p className="mt-3 text-xs text-neutral-500">No comments yet.</p>}
									{!readOnly ? <form className="mt-3 flex gap-2" onSubmit={(event) => { event.preventDefault(); const form = new FormData(event.currentTarget); void addComment(task.id, String(form.get("body") ?? "")); }}><input required maxLength={4000} name="body" aria-label={`Comment on ${task.label}`} placeholder="Add a comment" className={`min-w-0 flex-1 ${INPUT_CLASSES}`} /><button disabled={busyId === task.id} className={buttonClasses("secondary", "sm")}>Comment</button></form> : null}
								</div>
							) : null}
						</li>
					);
				})}
			</ul>
		</div>
	);
}

function savedFormAnswer(raw: string | null, key: string): unknown {
	if (!raw) return "";
	try { const parsed = JSON.parse(raw) as Record<string, unknown>; return parsed[key] ?? ""; } catch { return ""; }
}

function TaskFormInput({ field, value }: { field: TaskFormField; value: unknown }) {
	const label = <span className="font-medium text-neutral-200">{field.label}{field.required ? <span className="text-red-300"> *</span> : null}</span>;
	if (field.type === "textarea") return <label className="block space-y-1.5 text-sm">{label}<textarea name={field.key} required={field.required} rows={4} defaultValue={typeof value === "string" ? value : ""} className={`w-full ${INPUT_CLASSES}`} /></label>;
	if (field.type === "select") return <label className="block space-y-1.5 text-sm">{label}<select name={field.key} required={field.required} defaultValue={typeof value === "string" ? value : ""} className={`w-full ${INPUT_CLASSES}`}><option value="">Select…</option>{field.options?.map((option) => <option key={option} value={option}>{option}</option>)}</select></label>;
	if (field.type === "multiselect") {
		const selected = Array.isArray(value) ? new Set(value.map(String)) : new Set<string>();
		return <fieldset className="space-y-2"><legend className="text-sm">{label}</legend>{field.options?.map((option) => <label key={option} className="flex items-center gap-2 text-sm text-neutral-300"><input type="checkbox" name={field.key} value={option} defaultChecked={selected.has(option)} />{option}</label>)}</fieldset>;
	}
	return <label className="block space-y-1.5 text-sm">{label}<input name={field.key} required={field.required} type={field.type === "number" ? "number" : field.type === "email" ? "email" : field.type === "url" ? "url" : "text"} defaultValue={typeof value === "string" || typeof value === "number" ? String(value) : ""} className={`w-full ${INPUT_CLASSES}`} /></label>;
}
