"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type TaskView = {
	id: string;
	key: string;
	label: string;
	kind: "text" | "file";
	status: "pending" | "completed";
	accept: readonly string[];
	textValue: string | null;
	assetId: string | null;
};

type Props = {
	token: string;
	tasks: TaskView[];
};

export function TaskChecklist({ token, tasks }: Props) {
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
				body: JSON.stringify({ token, text }),
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
			form.set("token", token);
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
			{message ? (
				<p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
					{message}
				</p>
			) : null}
			{error ? (
				<p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
					{error}
				</p>
			) : null}
			<ul className="space-y-3">
				{tasks.map((task) => {
					const done = task.status === "completed";
					return (
						<li
							key={task.id}
							className={
								done
									? "rounded-lg border border-emerald-200 bg-emerald-50/60 px-4 py-3 text-sm"
									: "rounded-lg border border-neutral-200 bg-white px-4 py-3 text-sm"
							}
						>
							<div className="flex flex-wrap items-baseline justify-between gap-2">
								<p className="font-medium text-neutral-900">{task.label}</p>
								<span
									className={
										done
											? "rounded-md bg-emerald-100 px-2 py-0.5 text-xs font-medium uppercase tracking-wide text-emerald-900"
											: "rounded-md bg-amber-100 px-2 py-0.5 text-xs font-medium uppercase tracking-wide text-amber-900"
									}
								>
									{done ? "Done" : "To do"}
								</span>
							</div>

							{done ? (
								<p className="mt-2 text-neutral-700">
									{task.kind === "text"
										? (task.textValue ?? "Completed")
										: "File uploaded — thanks."}
								</p>
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
										minLength={20}
										rows={4}
										className="w-full rounded-md border border-neutral-300 bg-white px-3 py-2"
										placeholder={`Write your ${task.label.toLowerCase()} (20+ characters)`}
									/>
									<button
										type="submit"
										disabled={busyId === task.id}
										className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
									>
										{busyId === task.id ? "Saving…" : `Save ${task.label}`}
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
									<label className="flex cursor-pointer flex-col gap-1 rounded-md border border-dashed border-neutral-300 bg-neutral-50 px-3 py-4 text-sm hover:border-neutral-400">
										<span className="font-medium text-neutral-800">
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
											className="mt-1 block w-full text-sm file:mr-3 file:rounded file:border-0 file:bg-neutral-900 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-white"
										/>
									</label>
									<button
										type="submit"
										disabled={busyId === task.id}
										className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
									>
										{busyId === task.id ? "Uploading…" : "Upload"}
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
