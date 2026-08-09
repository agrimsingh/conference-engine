"use client";

import { useMemo, useState } from "react";
import { buttonClasses, INPUT_CLASSES, noticeClasses, StatusPill } from "@/components/ui";
import { formatTaskDueAt, formatUtcTimestamp } from "@/lib/speakers/task-display";

export type DeliverableDashboardRow = {
	id: string; personId: string; speaker: string; session: string; label: string;
	status: "pending" | "completed"; dueAt: number | null; instructions: string | null;
	versions: Array<{ id: string; versionNumber: number; filename: string | null; sizeBytes: number; createdAt: number }>;
	comments: Array<{ id: string; authorName: string; authorKind: string; body: string; createdAt: number }>;
};

export function DeliverablesDashboard({ eventSlug, rows }: { eventSlug: string; rows: DeliverableDashboardRow[] }) {
	const [status, setStatus] = useState("all");
	const [task, setTask] = useState("all");
	const [selected, setSelected] = useState<string[]>([]);
	const [notice, setNotice] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);
	const [now] = useState(() => Date.now());
	const labels = [...new Set(rows.map((row) => row.label))];
	const visible = useMemo(() => rows.filter((row) => {
		if (task !== "all" && row.label !== task) return false;
		if (status === "pending" && row.status !== "pending") return false;
		if (status === "completed" && row.status !== "completed") return false;
		if (status === "overdue" && !(row.status === "pending" && row.dueAt !== null && row.dueAt < now)) return false;
		return true;
	}), [rows, status, task, now]);

	async function json(url: string, body: unknown) {
		setBusy(true); setNotice(null); setError(null);
		try {
			const response = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
			const value = await response.json() as { ok?: boolean; error?: string; sent?: number; skipped?: number; assigned?: number };
			if (!response.ok || !value.ok) { setError(value.error ?? "Request failed"); return null; }
			return value;
		} catch { setError("Network error"); return null; } finally { setBusy(false); }
	}

	async function createTask(form: HTMLFormElement) {
		const data = new FormData(form);
		const result = await json(`/api/admin/events/${eventSlug}/tasks`, { label: data.get("label"), instructions: data.get("instructions"), dueDate: data.get("dueDate") });
		if (result) { setNotice(`Task created and assigned to ${result.assigned ?? 0} speaker-session pairs.`); window.location.reload(); }
	}

	async function remind(mode: "selected" | "all") {
		const candidates = visible.filter((row) => row.status === "pending");
		const personIds = [...new Set((mode === "selected" ? candidates.filter((row) => selected.includes(row.id)) : candidates).map((row) => row.personId))];
		if (!personIds.length) { setError("Choose at least one pending deliverable"); return; }
		const result = await json(`/api/admin/events/${eventSlug}/reminders`, { personIds });
		if (result) setNotice(`Reminder run complete: ${result.sent ?? 0} sent, ${result.skipped ?? 0} skipped.`);
	}

	async function comment(row: DeliverableDashboardRow, form: HTMLFormElement) {
		const body = String(new FormData(form).get("body") ?? "");
		const result = await json(`/api/admin/events/${eventSlug}/tasks/${row.id}/comments`, { body });
		if (result) { setNotice("Reply added."); window.location.reload(); }
	}

	return <div className="space-y-6">
		{notice ? <p role="status" className={noticeClasses("positive")}>{notice}</p> : null}
		{error ? <p role="alert" className={noticeClasses("negative")}>{error}</p> : null}
		<section className="rounded-lg border border-neutral-800 bg-neutral-900 p-4">
			<h2 className="font-medium text-neutral-100">Create file-request task</h2>
			<p className="mt-1 text-sm text-neutral-400">Assigns the request to every pending or confirmed speaker on accepted sessions.</p>
			<form className="mt-4 grid gap-3 sm:grid-cols-2" onSubmit={(event) => { event.preventDefault(); void createTask(event.currentTarget); }}>
				<label className="text-sm text-neutral-300">Task name<input required maxLength={160} name="label" className={`mt-1 w-full ${INPUT_CLASSES}`} /></label>
				<label className="text-sm text-neutral-300">Due date<input required type="date" name="dueDate" className={`mt-1 w-full ${INPUT_CLASSES}`} /></label>
				<label className="text-sm text-neutral-300 sm:col-span-2">Instructions<textarea maxLength={4000} name="instructions" rows={3} className={`mt-1 w-full ${INPUT_CLASSES}`} /></label>
				<button disabled={busy} className={`${buttonClasses("primary")} justify-self-start`}>Create and assign to all speakers</button>
			</form>
		</section>
		<section>
			<div className="flex flex-wrap items-end justify-between gap-3"><div className="flex flex-wrap gap-3"><label className="text-sm">Status<select value={status} onChange={(e) => setStatus(e.target.value)} className={`mt-1 block ${INPUT_CLASSES}`}><option value="all">All statuses</option><option value="pending">Incomplete</option><option value="overdue">Overdue</option><option value="completed">Complete</option></select></label><label className="text-sm">Task<select value={task} onChange={(e) => setTask(e.target.value)} className={`mt-1 block ${INPUT_CLASSES}`}><option value="all">All tasks</option>{labels.map((label) => <option key={label}>{label}</option>)}</select></label></div><div className="flex gap-2"><button disabled={busy || selected.length === 0} onClick={() => void remind("selected")} className={buttonClasses("secondary", "sm")}>Remind selected</button><button disabled={busy || visible.every((row) => row.status !== "pending")} onClick={() => void remind("all")} className={buttonClasses("primary", "sm")}>Remind all pending ({visible.filter((row) => row.status === "pending").length})</button></div></div>
			<p className="mt-2 text-xs text-neutral-500">Showing {visible.length} of {rows.length} speaker-task pairs.</p>
			<div className="mt-3 overflow-x-auto rounded-lg border border-neutral-800"><table className="w-full text-left text-sm"><thead className="bg-neutral-900 text-xs uppercase tracking-wide text-neutral-500"><tr><th className="p-3">Select</th><th className="p-3">Speaker / session</th><th className="p-3">Deliverable</th><th className="p-3">Due / status</th><th className="p-3">Files and comments</th></tr></thead><tbody>{visible.map((row) => { const overdue = row.status === "pending" && row.dueAt !== null && row.dueAt < now; return <tr key={row.id} className="border-t border-neutral-800 align-top"><td className="p-3"><input aria-label={`Select ${row.speaker} ${row.label}`} type="checkbox" checked={selected.includes(row.id)} onChange={(e) => setSelected((current) => e.target.checked ? [...current, row.id] : current.filter((id) => id !== row.id))} /></td><td className="p-3"><p className="text-neutral-100">{row.speaker}</p><p className="mt-1 text-xs text-neutral-500">{row.session}</p></td><td className="p-3"><p>{row.label}</p>{row.instructions ? <p className="mt-1 max-w-xs text-xs text-neutral-500">{row.instructions}</p> : null}</td><td className="p-3"><p>{row.dueAt ? formatTaskDueAt(row.dueAt) : "No due date"}</p><StatusPill tone={row.status === "completed" ? "positive" : overdue ? "negative" : "warning"}>{overdue ? "overdue" : row.status === "completed" ? "uploaded" : "incomplete"}</StatusPill></td><td className="min-w-80 p-3">{row.versions.length ? <><p className="text-xs text-neutral-400">{row.versions[0]?.filename} · {row.versions.length} version{row.versions.length === 1 ? "" : "s"} · uploaded {formatUtcTimestamp(row.versions[0]!.createdAt)}</p><ul className="mt-2 space-y-1 text-xs">{row.versions.map((version, index) => <li key={version.id}>v{version.versionNumber} {index === 0 ? "· Latest" : ""} · <a className="underline" href={`/api/admin/events/${eventSlug}/tasks/${row.id}/versions/${version.id}`}>Download {version.filename}</a></li>)}</ul>{row.comments.length ? <ul className="mt-3 space-y-2">{row.comments.map((c) => <li key={c.id} className="rounded bg-neutral-950 p-2 text-xs"><p className="text-neutral-300">{c.authorName} · {formatUtcTimestamp(c.createdAt)}</p><p className="mt-1 text-neutral-400">{c.body}</p></li>)}</ul> : <p className="mt-2 text-xs text-neutral-500">No comments.</p>}<form className="mt-2 flex gap-2" onSubmit={(e) => { e.preventDefault(); void comment(row, e.currentTarget); }}><input required maxLength={4000} name="body" placeholder="Reply" className={`min-w-0 flex-1 ${INPUT_CLASSES}`} /><button disabled={busy} className={buttonClasses("secondary", "sm")}>Reply</button></form></> : <span className="text-xs text-neutral-500">No file uploaded</span>}</td></tr>; })}</tbody></table></div>
		</section>
	</div>;
}
