"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { DecisionButtons } from "@/components/decision-buttons";
import { buttonClasses, EmptyState, INPUT_CLASSES, noticeClasses, StatusPill, submissionStatusTone } from "@/components/ui";
import type { DecisionAction, RenderedMessage } from "@/lib/domain";

type CriterionView = { id: string; label: string; description: string | null; weight: number; scaleMin: number; scaleMax: number };
type CriterionScoreView = { id: string; criterionId: string; score: number; comment: string | null; reviewerId: string | null };
type ScoreView = { id: string; score: number; comment: string | null; scoredBy: string };
type SubmissionView = {
	id: string; status: string; submitterName: string | null; submitterEmail: string | null; title: string; category: string; format: string | null;
	answers: Array<{ label: string; value: string }>; assignment: string; previews: Record<DecisionAction, RenderedMessage>; scores: ScoreView[]; criterionScores: CriterionScoreView[];
};
type Props = { eventSlug: string; token: string; canDecide: boolean; reviewerId: string | null; criteria: CriterionView[]; submissions: SubmissionView[] };

export function ReviewBoard({ eventSlug, token, canDecide, reviewerId, criteria, submissions }: Props) {
	const router = useRouter();
	const [error, setError] = useState<string | null>(null);
	const [pendingId, setPendingId] = useState<string | null>(null);
	const [query, setQuery] = useState("");
	const [status, setStatus] = useState("all");
	const [picked, setPicked] = useState<Record<string, Record<string, number>>>({});
	const [comments, setComments] = useState<Record<string, Record<string, string>>>({});
	const visible = useMemo(() => submissions.filter((row) => {
		const matchesQuery = `${row.title} ${row.submitterName ?? ""} ${row.submitterEmail ?? ""} ${row.category}`.toLowerCase().includes(query.trim().toLowerCase());
		return matchesQuery && (status === "all" || row.status === status);
	}), [query, status, submissions]);
	const completed = submissions.filter((row) => authoredScores(row, reviewerId).length === criteria.length && criteria.length > 0).length;

	async function scoreSubmission(row: SubmissionView) {
		if (!criteria.length) { setError("This plan has no rubric criteria. Ask an organizer to add one."); return; }
		setPendingId(row.id); setError(null);
		const existing = new Map(authoredScores(row, reviewerId).map((score) => [score.criterionId, score]));
		const criterionScores = criteria.map((criterion) => ({
			criterionId: criterion.id,
			score: picked[row.id]?.[criterion.id] ?? existing.get(criterion.id)?.score ?? midpoint(criterion),
			comment: comments[row.id]?.[criterion.id] ?? existing.get(criterion.id)?.comment ?? "",
		}));
		try {
			const response = await fetch("/api/review/score", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token, eventSlug, submissionId: row.id, criterionScores }) });
			const data = await response.json() as { ok?: boolean; error?: string };
			if (!response.ok || !data.ok) { setError(data.error ?? "Score failed"); return; }
			router.refresh();
		} catch { setError("Network error"); } finally { setPendingId(null); }
	}

	if (!submissions.length) return <EmptyState title="No submissions to review" description="Assignments will appear here when an organizer adds them." />;

	return <div className="space-y-4">
		<div className="flex flex-wrap items-end justify-between gap-3 rounded-lg border border-neutral-800 bg-neutral-900/70 px-3 py-3 text-sm">
			<div><p className="font-medium text-neutral-100">Review progress</p><p className="mt-0.5 text-neutral-400">{completed}/{submissions.length} proposals fully scored across {criteria.length} criteria.</p></div>
			<div className="flex flex-wrap gap-2"><input value={query} onChange={(event) => setQuery(event.target.value)} className={INPUT_CLASSES} placeholder="Search proposals" aria-label="Search proposals" /><select value={status} onChange={(event) => setStatus(event.target.value)} className={INPUT_CLASSES} aria-label="Filter by status"><option value="all">All statuses</option>{[...new Set(submissions.map((row) => row.status))].map((value) => <option key={value} value={value}>{value.replaceAll("_", " ")}</option>)}</select></div>
		</div>
		{error ? <p className={noticeClasses("negative")}>{error}</p> : null}
		{visible.length === 0 ? <EmptyState title="No matching proposals" description="Change the search or status filter to see assigned work." /> : null}
		<ul className="divide-y divide-neutral-800 rounded-lg border border-neutral-800 bg-neutral-900">
			{visible.map((row) => {
				const busy = pendingId === row.id; const avg = row.scores.length ? row.scores.reduce((sum, score) => sum + score.score, 0) / row.scores.length : null;
				const own = new Map(authoredScores(row, reviewerId).map((score) => [score.criterionId, score]));
				return <li key={row.id} className="space-y-4 px-4 py-4 text-sm">
					<div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-medium text-neutral-100">{row.title}</p><p className="mt-1 text-neutral-400">{row.submitterName} · {row.submitterEmail}</p><p className="mt-1 text-xs text-neutral-500">{row.category}{row.format ? ` · ${row.format}` : ""} · {row.assignment}</p></div><StatusPill tone={submissionStatusTone(row.status)}>{row.status.replaceAll("_", " ")}{avg !== null ? ` · avg ${avg.toFixed(1)}` : ""}</StatusPill></div>
					{row.scores.length ? <ul className="space-y-1 text-xs text-neutral-400">{row.scores.map((score) => <li key={score.id}>{score.scoredBy}: {score.score}/5{score.comment ? ` — ${score.comment}` : ""}</li>)}</ul> : null}
					<details className="rounded-md border border-neutral-800 bg-neutral-950/40 px-3 py-2"><summary className="cursor-pointer font-medium text-neutral-200">Proposal details</summary><dl className="mt-3 grid gap-2 text-xs sm:grid-cols-2">{row.answers.map((answer) => <div key={answer.label}><dt className="text-neutral-500">{answer.label}</dt><dd className="mt-0.5 whitespace-pre-wrap text-neutral-300">{answer.value}</dd></div>)}</dl></details>
					<div className="space-y-3 rounded-md border border-neutral-800 bg-neutral-950/30 p-3"><div><p className="font-medium text-neutral-100">Rubric</p><p className="mt-0.5 text-xs text-neutral-500">Score each criterion, then save this review.</p></div>{criteria.map((criterion) => { const selected = picked[row.id]?.[criterion.id] ?? own.get(criterion.id)?.score ?? midpoint(criterion); const scoreComment = comments[row.id]?.[criterion.id] ?? own.get(criterion.id)?.comment ?? ""; return <fieldset key={criterion.id} className="border-t border-neutral-800 pt-3"><legend className="font-medium text-neutral-200">{criterion.label} <span className="font-normal text-neutral-500">· weight {criterion.weight}</span></legend>{criterion.description ? <p className="mt-0.5 text-xs text-neutral-500">{criterion.description}</p> : null}<div className="mt-2 flex flex-wrap items-end gap-2"><div className="inline-flex rounded-lg border border-neutral-800 bg-neutral-950/60 p-0.5" role="group" aria-label={`${criterion.label} score for ${row.title}`}>{range(criterion.scaleMin, criterion.scaleMax).map((value) => <button key={value} type="button" disabled={busy} onClick={() => setPicked((previous) => ({ ...previous, [row.id]: { ...previous[row.id], [criterion.id]: value } }))} className={selected === value ? "min-w-9 rounded-md bg-neutral-800 px-2 py-1.5 text-sm font-semibold tabular-nums text-neutral-100" : "min-w-9 rounded-md px-2 py-1.5 text-sm font-medium tabular-nums text-neutral-400 hover:text-neutral-100 disabled:opacity-40"}>{value}</button>)}</div><label className="min-w-[12rem] flex-1 text-xs text-neutral-400">Criterion comment<input value={scoreComment} onChange={(event) => setComments((previous) => ({ ...previous, [row.id]: { ...previous[row.id], [criterion.id]: event.target.value } }))} className={`mt-1 w-full ${INPUT_CLASSES} py-1.5`} disabled={busy} /></label></div></fieldset>; })}<button type="button" disabled={busy} onClick={() => void scoreSubmission(row)} className={buttonClasses("secondary")}>{busy ? "Saving…" : "Save rubric review"}</button></div>
					{canDecide ? <div className="border-t border-neutral-800 pt-3"><DecisionButtons eventSlug={eventSlug} submissionId={row.id} status={row.status} previews={row.previews} /></div> : null}
				</li>;
			})}
		</ul>
	</div>;
}

function authoredScores(row: SubmissionView, reviewerId: string | null) { return row.criterionScores.filter((score) => score.reviewerId === reviewerId); }
function midpoint(criterion: CriterionView) { return Math.round((criterion.scaleMin + criterion.scaleMax) / 2); }
function range(min: number, max: number) { return Array.from({ length: max - min + 1 }, (_, index) => min + index); }
