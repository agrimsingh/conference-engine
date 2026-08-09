"use client";
import { useState } from "react";
import { buttonClasses, noticeClasses } from "@/components/ui";
import { formatUtcTimestamp } from "@/lib/speakers/task-display";

export type FileLibraryRow = { taskId: string; filename: string; session: string; speaker: string; uploadedAt: number; versionCount: number };

export function FilesLibrary({ eventSlug, rows }: { eventSlug: string; rows: FileLibraryRow[] }) {
	const [selected, setSelected] = useState(rows.map((row) => row.taskId));
	const [notice, setNotice] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);
	async function download() {
		setBusy(true); setNotice("Generating latest-version ZIP…"); setError(null);
		try {
			const response = await fetch(`/api/admin/events/${eventSlug}/files/export`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ taskIds: selected }) });
			if (!response.ok) { const value = await response.json() as { error?: string }; setError(value.error ?? "Export failed"); setNotice(null); return; }
			const blob = await response.blob(); const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = url; link.download = `${eventSlug}-latest-deliverables.zip`; link.click(); URL.revokeObjectURL(url);
			setNotice(`ZIP ready: ${response.headers.get("x-deliverable-count") ?? selected.length} latest file version(s).`);
		} catch { setError("Network error"); setNotice(null); } finally { setBusy(false); }
	}
	return <div className="space-y-4">{notice ? <p role="status" className={noticeClasses("positive")}>{notice}</p> : null}{error ? <p role="alert" className={noticeClasses("negative")}>{error}</p> : null}<div className="flex flex-wrap items-center justify-between gap-3"><p className="text-sm text-neutral-400">Select uploaded deliverables. The ZIP includes each file&apos;s latest version, grouped by session and speaker.</p><button className={buttonClasses("primary")} disabled={busy || !selected.length} onClick={() => void download()}>{busy ? "Generating…" : `Download latest files ZIP (${selected.length})`}</button></div><div className="overflow-x-auto rounded-lg border border-neutral-800"><table className="w-full text-left text-sm"><thead className="bg-neutral-900 text-xs uppercase tracking-wide text-neutral-500"><tr><th className="p-3">Select</th><th className="p-3">File</th><th className="p-3">Session</th><th className="p-3">Speaker</th><th className="p-3">Uploaded</th><th className="p-3">Versions</th></tr></thead><tbody>{rows.map((row) => <tr key={row.taskId} className="border-t border-neutral-800"><td className="p-3"><input type="checkbox" aria-label={`Select ${row.filename}`} checked={selected.includes(row.taskId)} onChange={(e) => setSelected((current) => e.target.checked ? [...current, row.taskId] : current.filter((id) => id !== row.taskId))} /></td><td className="p-3 font-medium text-neutral-100">{row.filename}</td><td className="p-3 text-neutral-300">{row.session}</td><td className="p-3 text-neutral-300">{row.speaker}</td><td className="p-3 text-neutral-400">{formatUtcTimestamp(row.uploadedAt)}</td><td className="p-3 text-neutral-300">{row.versionCount}</td></tr>)}</tbody></table></div></div>;
}
