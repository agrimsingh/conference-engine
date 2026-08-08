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

	async function completeBio(taskId: string, text: string) {
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
				setError(data.error ?? "Failed to save bio");
				return;
			}
			setMessage("Bio saved");
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
			{message ? <p className="text-sm text-green-700">{message}</p> : null}
			{error ? <p className="text-sm text-red-700">{error}</p> : null}
			<ul className="space-y-4">
				{tasks.map((task) => (
					<li
						key={task.id}
						className="rounded border border-neutral-200 bg-white px-4 py-3 text-sm"
					>
						<div className="flex flex-wrap items-baseline justify-between gap-2">
							<p className="font-medium">{task.label}</p>
							<span className="rounded bg-neutral-100 px-2 py-0.5 text-xs uppercase tracking-wide">
								{task.status}
							</span>
						</div>
						<p className="mt-1 font-mono text-xs text-neutral-500">{task.key}</p>

						{task.status === "completed" ? (
							<p className="mt-2 text-neutral-600">
								{task.kind === "text"
									? (task.textValue ?? "Done")
									: `Asset ${task.assetId}`}
							</p>
						) : task.kind === "text" ? (
							<form
								className="mt-3 space-y-2"
								onSubmit={(event) => {
									event.preventDefault();
									const form = new FormData(event.currentTarget);
									const text = String(form.get("text") ?? "");
									void completeBio(task.id, text);
								}}
							>
								<textarea
									name="text"
									required
									minLength={20}
									rows={4}
									className="w-full rounded border border-neutral-300 px-3 py-2"
									placeholder="Short speaker bio (20+ chars)"
								/>
								<button
									type="submit"
									disabled={busyId === task.id}
									className="rounded bg-neutral-900 px-3 py-1.5 text-white disabled:opacity-50"
								>
									{busyId === task.id ? "Saving…" : "Save bio"}
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
								<input
									type="file"
									name="file"
									required
									accept={task.accept.join(",")}
									className="block w-full text-sm"
								/>
								<button
									type="submit"
									disabled={busyId === task.id}
									className="rounded bg-neutral-900 px-3 py-1.5 text-white disabled:opacity-50"
								>
									{busyId === task.id ? "Uploading…" : "Upload"}
								</button>
							</form>
						)}
					</li>
				))}
			</ul>
		</div>
	);
}
