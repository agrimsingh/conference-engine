"use client";

import { useState } from "react";
import { Button, StatusPill, submissionStatusTone } from "@/components/ui";

type SessionRow = { id: string; title: string; speaker: string | null; status: string; origin: string; hasSlot: boolean; lineageParentId: string | null };
type CloneSource = { id: string; title: string; eventName: string; eventSlug: string; status: string; speaker: string | null };
type PreviewRow = { row: number; issues: string[]; duplicate: string; input: { title?: string } | null };

async function postJson(url: string, body: unknown) {
	const response = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
	const value: unknown = await response.json().catch(() => ({ ok: false, error: "Invalid server response" }));
	return { response, value: value as { ok?: boolean; error?: string; rows?: PreviewRow[]; created?: number; idempotent?: number; repaired?: number; failed?: number; partial?: boolean; sessionId?: string; changed?: number } };
}

export function SessionWorkbench({
	eventSlug,
	sessions,
	cloneSources,
}: {
	eventSlug: string;
	sessions: SessionRow[];
	cloneSources: CloneSource[];
}) {
	const base = `/api/admin/events/${eventSlug}/sessions`;
	const [message, setMessage] = useState<string | null>(null);
	const [importCsv, setImportCsv] = useState("title,abstract,speaker_name,speaker_email,video_url,google_doc_url,supporting_url\n");
	const [preview, setPreview] = useState<PreviewRow[] | null>(null);
	const [selected, setSelected] = useState<string[]>([]);
	const [busy, setBusy] = useState(false);

	async function create(form: HTMLFormElement) {
		const data = new FormData(form);
		setBusy(true); setMessage(null);
		const { value } = await postJson(base, { origin: data.get("origin"), input: { title: data.get("title"), abstract: data.get("abstract"), category: data.get("category"), videoUrl: data.get("videoUrl"), googleDocUrl: data.get("googleDocUrl"), supportingUrl: data.get("supportingUrl"), speakers: data.get("speakerName") || data.get("speakerEmail") ? [{ name: data.get("speakerName"), email: data.get("speakerEmail"), bio: data.get("speakerBio") }] : [] } });
		setBusy(false);
		if (value.ok) { form.reset(); setMessage(`Created session ${value.sessionId}. Reloading…`); window.location.reload(); }
		else setMessage(value.error ?? "Could not create session");
	}

	async function previewImport() {
		setBusy(true); setMessage(null);
		const { value } = await postJson(`${base}/import/preview`, { csv: importCsv });
		setBusy(false); setPreview(value.rows ?? null);
		setMessage(value.ok ? "Preview is ready. Resolve every flagged row before importing." : value.error ?? "Could not preview CSV");
	}

	async function commitImport() {
		setBusy(true); setMessage(null);
		const { value } = await postJson(`${base}/import/commit`, { csv: importCsv });
		setBusy(false); setPreview(value.rows ?? null);
		if (value.ok) {
			const summary = `Imported ${value.created ?? 0}; repaired ${value.repaired ?? 0}; ${value.idempotent ?? 0} were already complete.`;
			if (value.partial) setMessage(`${summary} ${value.failed ?? 0} row(s) failed after earlier rows committed; review the marked rows and retry them.`);
			else { setMessage(`${summary} Reloading…`); window.location.reload(); }
		}
		else setMessage(value.error ?? "Could not import CSV");
	}

	async function clone(form: HTMLFormElement) {
		const sourceSubmissionId = new FormData(form).get("sourceSubmissionId");
		setBusy(true); setMessage(null);
		const { value } = await postJson(`${base}/clone`, { sourceSubmissionId });
		setBusy(false);
		if (value.ok) { setMessage(`Cloned session ${value.sessionId}. Reloading…`); window.location.reload(); }
		else setMessage(value.error ?? "Could not clone session");
	}

	async function bulk(action: "publish" | "unpublish") {
		setBusy(true); setMessage(null);
		const { value } = await postJson(`${base}/bulk-publish`, { action, sessionIds: selected, ...(action === "publish" ? { approveContent: true } : {}) });
		setBusy(false);
		if (value.ok) { setMessage(`${action === "publish" ? "Published" : "Unpublished"} ${value.changed ?? 0} sessions. Reloading…`); window.location.reload(); }
		else setMessage(value.error ?? "Could not update publication");
	}

	return (
		<div className="space-y-8">
			{message ? <p role="status" className="rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-300">{message}</p> : null}
			<section className="rounded-lg border border-neutral-800 bg-neutral-900 p-4">
				<h2 className="text-base font-medium text-neutral-100">Create a session</h2>
				<p className="mt-1 text-sm text-neutral-400">Manual sessions can be scheduled immediately. Invited sessions also materialize the named speaker for the portal, tasks, and communications.</p>
				<form className="mt-4 grid gap-3 sm:grid-cols-2" onSubmit={(event) => { event.preventDefault(); void create(event.currentTarget); }}>
					<label className="grid gap-1 text-sm sm:col-span-2">Title<input required name="title" maxLength={240} className="rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2" /></label>
					<label className="grid gap-1 text-sm sm:col-span-2">Abstract<textarea name="abstract" maxLength={8000} rows={3} className="rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2" /></label>
					<label className="grid gap-1 text-sm">Type<select name="origin" defaultValue="manual" className="rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2"><option value="manual">Manual</option><option value="invited">Invited speaker</option></select></label>
					<label className="grid gap-1 text-sm">Track<input name="category" maxLength={120} className="rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2" /></label>
					<label className="grid gap-1 text-sm">Speaker name<input name="speakerName" maxLength={160} className="rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2" /></label>
					<label className="grid gap-1 text-sm">Speaker email<input name="speakerEmail" type="email" maxLength={254} className="rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2" /></label>
					<label className="grid gap-1 text-sm sm:col-span-2">Speaker bio<textarea name="speakerBio" maxLength={8000} rows={2} className="rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2" /></label>
					<label className="grid gap-1 text-sm">Video URL<input name="videoUrl" type="url" maxLength={2048} className="rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2" /></label>
					<label className="grid gap-1 text-sm">Google Doc URL<input name="googleDocUrl" type="url" maxLength={2048} className="rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2" /></label>
					<label className="grid gap-1 text-sm sm:col-span-2">Supporting URL<input name="supportingUrl" type="url" maxLength={2048} className="rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2" /></label>
					<Button type="submit" variant="primary" disabled={busy} className="justify-self-start">Create session</Button>
				</form>
			</section>

			<section className="rounded-lg border border-neutral-800 bg-neutral-900 p-4">
				<h2 className="text-base font-medium text-neutral-100">Import CSV</h2>
				<p className="mt-1 text-sm text-neutral-400">Paste a Sessionboard CSV export (or our columns). Required: <code>title</code> / Session Title. Optional: Description, Track, First Name + Last Name, Email, Biography, video_url, google_doc_url, supporting_url. Preview checks formulas, URLs, duplicate rows, and existing sessions before anything is written.</p>
				<textarea aria-label="Session CSV" value={importCsv} onChange={(event) => setImportCsv(event.target.value)} rows={8} className="mt-3 w-full rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 font-mono text-xs" />
				<div className="mt-3 flex gap-2"><Button onClick={() => void previewImport()} disabled={busy}>Preview import</Button><Button variant="primary" onClick={() => void commitImport()} disabled={busy || !preview}>Commit import</Button></div>
				{preview ? <ul className="mt-3 space-y-1 text-sm">{preview.map((row) => <li key={row.row} className={row.issues.length ? "text-amber-300" : "text-neutral-400"}>Row {row.row}: {row.input?.title ?? "Invalid row"}{row.issues.length ? ` — ${row.issues.join("; ")}` : row.duplicate === "idempotent" ? " — already imported" : " — ready"}</li>)}</ul> : null}
			</section>

			<section className="rounded-lg border border-neutral-800 bg-neutral-900 p-4">
				<h2 className="text-base font-medium text-neutral-100">Clone session content</h2>
				<p className="mt-1 text-sm text-neutral-400">Copies the session, confirmed speakers, media fields, and an explicit parent/root lineage. Pick an accepted, scheduled, or published session from any event you can manage.</p>
				{cloneSources.length === 0 ? (
					<p className="mt-3 text-sm text-neutral-500">No cloneable sessions yet. Accept or schedule a session first.</p>
				) : (
					<form className="mt-3 flex flex-wrap items-end gap-2" onSubmit={(event) => { event.preventDefault(); void clone(event.currentTarget); }}>
						<label className="grid min-w-72 flex-1 gap-1 text-sm">
							<span className="text-neutral-400">Source session</span>
							<select name="sourceSubmissionId" required className="rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm">
								<option value="">Select a session…</option>
								{cloneSources.map((source) => (
									<option key={source.id} value={source.id}>
										{source.eventSlug === eventSlug ? source.title : `${source.eventName}: ${source.title}`} ({source.status}{source.speaker ? ` · ${source.speaker}` : ""})
									</option>
								))}
							</select>
						</label>
						<Button type="submit" disabled={busy}>Clone content</Button>
					</form>
				)}
			</section>

			<section>
				<div className="flex flex-wrap items-end justify-between gap-3"><div><h2 className="text-base font-medium text-neutral-100">Sessions</h2><p className="mt-1 text-sm text-neutral-400">Publishing is all-or-nothing: every selected session needs a schedule slot. Publishing explicitly approves each current content revision as its immutable public snapshot.</p></div><div className="flex gap-2"><Button variant="primary" onClick={() => void bulk("publish")} disabled={busy || selected.length === 0}>Approve &amp; publish selected</Button><Button onClick={() => void bulk("unpublish")} disabled={busy || selected.length === 0}>Unpublish selected</Button></div></div>
				<div className="mt-3 overflow-x-auto rounded-lg border border-neutral-800"><table className="w-full text-left text-sm"><thead className="bg-neutral-900 text-xs uppercase tracking-wide text-neutral-500"><tr><th className="p-3"><span className="sr-only">Select</span></th><th className="p-3">Session</th><th className="p-3">Speaker</th><th className="p-3">Origin</th><th className="p-3">State</th></tr></thead><tbody>{sessions.map((session) => <tr key={session.id} className="border-t border-neutral-800"><td className="p-3"><input aria-label={`Select ${session.title}`} type="checkbox" checked={selected.includes(session.id)} onChange={(event) => setSelected((current) => event.target.checked ? [...current, session.id] : current.filter((id) => id !== session.id))} /></td><td className="p-3 text-neutral-100"><p>{session.title}</p><p className="font-mono text-xs text-neutral-600">{session.id}{session.lineageParentId ? ` · clone of ${session.lineageParentId}` : ""}</p></td><td className="p-3 text-neutral-400">{session.speaker ?? "—"}</td><td className="p-3 text-neutral-400">{session.origin}</td><td className="p-3"><StatusPill tone={submissionStatusTone(session.status)}>{session.status}{session.hasSlot ? " · placed" : ""}</StatusPill></td></tr>)}</tbody></table></div>
			</section>
		</div>
	);
}
