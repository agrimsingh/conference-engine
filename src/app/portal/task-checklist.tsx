"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
	buttonClasses,
	INPUT_CLASSES,
	noticeClasses,
	StatusPill,
} from "@/components/ui";

export type TaskView = {
	id: string;
	key: string;
	label: string;
	kind: "text" | "file";
	status: "pending" | "completed";
	accept: readonly string[];
	textValue: string | null;
	assetId: string | null;
	required: boolean;
};

type Props = {
	tasks: TaskView[];
	compact?: boolean;
	readOnly?: boolean;
};

export function textTaskRules(key: string): { minLength: number | undefined; hint: string } {
	return key === "bio" ? { minLength: 20, hint: " (20+ characters)" } : { minLength: undefined, hint: "" };
}

export function TaskChecklist({ tasks, compact = false, readOnly = false }: Props) {
	const router = useRouter();
	const [message, setMessage] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [busyId, setBusyId] = useState<string | null>(null);

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

	return (
		<div className="space-y-4">
			{message ? <p className={noticeClasses("positive")}>{message}</p> : null}
			{error ? <p className={noticeClasses("negative")}>{error}</p> : null}
			<ul className="space-y-3">
				{tasks.map((task) => {
					const done = task.status === "completed";
					const bioRules = textTaskRules(task.key);
					return (
						<li
							key={task.id}
							className={`${compact ? "border-t border-neutral-800 py-3 first:border-t-0" : "rounded-lg border border-neutral-800 bg-neutral-900 px-4 py-3"} text-sm`}
						>
							<div className="flex flex-wrap items-baseline justify-between gap-2">
								<p className="font-medium text-neutral-100">{task.label}</p>
								<StatusPill tone={done ? "positive" : task.required ? "warning" : "neutral"}>
									{done ? "Done" : task.required ? "To do" : "Optional"}
								</StatusPill>
							</div>

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
												? `Accepted: ${task.accept.join(", ")}`
												: "Any file type"}
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
						</li>
					);
				})}
			</ul>
		</div>
	);
}
