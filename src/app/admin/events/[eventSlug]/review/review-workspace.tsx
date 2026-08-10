"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { AdminSectionShell } from "@/components/admin-section-shell";
import { Button, buttonClasses, EmptyState, INPUT_CLASSES, noticeClasses, StatusPill, submissionStatusTone } from "@/components/ui";
import { DECISION_REGISTRY, renderDecisionPreviews, type DecisionAction } from "@/lib/domain/decisions";
import { buildScoreComparisonMatrix } from "@/lib/evaluation/score-matrix";
import {
	sortScoreMatrixRows,
	type ScoreMatrixSortDirection,
	type ScoreMatrixSortKey,
} from "@/lib/evaluation/score-matrix-sort";
import { activationReviewPath } from "./activation-result";
import { parseBulkDecisionResult } from "./bulk-decision-result";

type Plan = { id: string; name: string; status: string; openAt: number | null; closeAt: number | null; blindReview: boolean; assignmentCap: number | null; scorecardSummary?: string[] };
type Criterion = { id: string; label: string; description: string | null; weight: number; scaleMin: number; scaleMax: number; type: "numeric" | "dropdown" | "text"; options: string[] };
type Reviewer = { id: string; name: string; email: string | null; revokedAt: number | null; assigned: number; scored: number };
type SubmissionSpeaker = { name: string; email: string; status: string };
type Submission = { id: string; title: string; submitter: string; speakers: SubmissionSpeaker[]; status: string; assignedReviewerIds: string[]; scored: boolean; criterionScoreCount: number };
type AggregateScore = { submissionId: string; reviewerId: string | null; scoredBy: string; score: number; comment: string | null };
type CriterionScore = { submissionId: string; reviewerId: string | null; criterionId: string; score: number; valueText: string | null; comment: string | null };
type SectionId = "rounds" | "rubric" | "reviewers" | "assignments" | "scores";

const SECTIONS: Array<{ id: SectionId; label: string; description: string }> = [
	{ id: "rounds", label: "Review rounds", description: "Create rounds, set dates, and activate the active evaluation plan." },
	{ id: "rubric", label: "Weighted rubric", description: "Criteria every reviewer must score on each proposal." },
	{ id: "reviewers", label: "Named reviewers", description: "Issue personal review links and manage revocations." },
	{ id: "assignments", label: "Assignments", description: "Assign reviewers, label proposals, and bulk accept or reject." },
	{ id: "scores", label: "Score comparison", description: "Aggregate scores, criterion values, and reviewer feedback." },
];

function parseSection(value: string | null): SectionId {
	switch (value) {
		case "rubric":
		case "reviewers":
		case "assignments":
		case "scores":
		case "rounds":
			return value;
		default:
			return "rounds";
	}
}

type Props = {
	eventSlug: string;
	eventName: string;
	plans: Plan[];
	plan: Plan | null;
	criteria: Criterion[];
	reviewers: Reviewer[];
	submissions: Submission[];
	aggregates: AggregateScore[];
	criterionScores: CriterionScore[];
	summary: { total: number; scored: number; accepted: number; rejected: number };
};

export function ReviewWorkspace({
	eventSlug,
	eventName,
	plans,
	plan,
	criteria,
	reviewers,
	submissions,
	aggregates,
	criterionScores,
	summary,
}: Props) {
	const router = useRouter();
	const searchParams = useSearchParams();
	const section = parseSection(searchParams.get("section"));
	const [message, setMessage] = useState<string | null>(null);
	const [decisionMessage, setDecisionMessage] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [pending, setPending] = useState(false);
	const [issuedReviewPath, setIssuedReviewPath] = useState<string | null>(null);
	const [committeeReviewPath, setCommitteeReviewPath] = useState<string | null>(null);
	const [planName, setPlanName] = useState("");
	const [editedPlanName, setEditedPlanName] = useState(plan?.name ?? "");
	const [openDate, setOpenDate] = useState(dateInputValue(plan?.openAt ?? null));
	const [closeDate, setCloseDate] = useState(dateInputValue(plan?.closeAt ?? null));
	const [blindReview, setBlindReview] = useState(plan?.blindReview ?? false);
	const [assignmentCap, setAssignmentCap] = useState(plan?.assignmentCap === null || plan?.assignmentCap === undefined ? "" : String(plan.assignmentCap));
	const [reviewerName, setReviewerName] = useState("");
	const [reviewerEmail, setReviewerEmail] = useState("");
	const [criterionLabel, setCriterionLabel] = useState("");
	const [criterionWeight, setCriterionWeight] = useState("1");
	const [criterionType, setCriterionType] = useState<Criterion["type"]>("numeric");
	const [criterionOptions, setCriterionOptions] = useState("Accept\nMaybe\nReject");
	const [selected, setSelected] = useState<Set<string>>(new Set());
	const [reviewersForBulk, setReviewersForBulk] = useState<Set<string>>(new Set());
	const [query, setQuery] = useState("");
	const [status, setStatus] = useState("all");
	const [bulkLabel, setBulkLabel] = useState("");
	const [bulkAction, setBulkAction] = useState<DecisionAction | null>(null);
	const [sendEmail, setSendEmail] = useState(true);
	const [emailSubject, setEmailSubject] = useState("");
	const [emailText, setEmailText] = useState("");
	const [matrixSortKey, setMatrixSortKey] = useState<ScoreMatrixSortKey>("avg");
	const [matrixSortDir, setMatrixSortDir] = useState<ScoreMatrixSortDirection>("desc");

	const setSection = useCallback(
		(next: SectionId) => {
			const params = new URLSearchParams(searchParams.toString());
			if (next === "rounds") params.delete("section");
			else params.set("section", next);
			const queryString = params.toString();
			router.replace(
				queryString
					? `/admin/events/${eventSlug}/review?${queryString}`
					: `/admin/events/${eventSlug}/review`,
				{ scroll: false },
			);
		},
		[eventSlug, router, searchParams],
	);

	const visible = useMemo(
		() => submissions.filter((submission) => `${submission.title} ${submission.submitter} ${submission.speakers.map((speaker) => `${speaker.name} ${speaker.email}`).join(" ")}`.toLowerCase().includes(query.trim().toLowerCase()) && (status === "all" || submission.status === status)),
		[query, status, submissions],
	);
	const active = plan?.status === "active";
	const liveReviewers = reviewers.filter((reviewer) => reviewer.revokedAt === null);
	const previews = useMemo(
		() => renderDecisionPreviews({ eventName, submitterName: "submitters", title: "selected proposals" }),
		[eventName],
	);
	const matrix = useMemo(
		() => buildScoreComparisonMatrix({
			submissions: submissions.map((submission) => ({ id: submission.id, title: submission.title })),
			reviewers: reviewers.map((reviewer) => ({ id: reviewer.id, name: `${reviewer.name}${reviewer.revokedAt === null ? "" : " (revoked)"}` })),
			criteria: criteria.map((criterion) => ({ id: criterion.id, label: criterion.label, weight: criterion.weight, type: criterion.type })),
			aggregates,
			criterionScores,
		}),
		[aggregates, criteria, criterionScores, reviewers, submissions],
	);
	const statusBySubmission = useMemo(
		() => new Map(submissions.map((submission) => [submission.id, submission.status])),
		[submissions],
	);
	const sortedMatrixRows = useMemo(
		() =>
			sortScoreMatrixRows(
				matrix.submissions.map((submission) => ({
					id: submission.id,
					title: submission.title,
					status: statusBySubmission.get(submission.id) ?? "",
					average: matrix.averages[submission.id] ?? null,
				})),
				matrixSortKey,
				matrixSortDir,
			),
		[matrix.averages, matrix.submissions, matrixSortDir, matrixSortKey, statusBySubmission],
	);

	function toggleMatrixSort(key: ScoreMatrixSortKey) {
		if (matrixSortKey === key) {
			setMatrixSortDir((previous) => (previous === "asc" ? "desc" : "asc"));
			return;
		}
		setMatrixSortKey(key);
		setMatrixSortDir(key === "avg" ? "desc" : "asc");
	}

	async function request(path: string, method: string, body?: unknown) {
		setError(null);
		setMessage(null);
		setDecisionMessage(null);
		setPending(true);
		try {
			const response = await fetch(path, {
				method,
				headers: body === undefined ? undefined : { "content-type": "application/json" },
				body: body === undefined ? undefined : JSON.stringify(body),
			});
			const data = await response.json() as {
				ok?: boolean;
				error?: string;
				emailStatus?: string | null;
				reviewer?: { reviewPath?: string };
				sent?: number;
				skipped?: number;
			};
			const decisions = parseBulkDecisionResult(data);
			if (!response.ok || (!data.ok && !decisions)) throw new Error(data.error ?? "Request failed");
			if (decisions) setDecisionMessage(decisions.message);
			else if (typeof data.sent === "number") setMessage(`Reminders sent: ${data.sent}, skipped: ${data.skipped ?? 0}.`);
			else if (data.emailStatus === "sent" || data.emailStatus === "skipped") setMessage(`Saved. Invite email ${data.emailStatus}.`);
			else if (data.emailStatus === "failed") setMessage("Saved. Invite email failed; copy the link below.");
			else setMessage("Saved.");
			router.refresh();
			return data;
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : "Network error");
			return null;
		} finally {
			setPending(false);
		}
	}

	async function copyReviewPath(path: string) {
		const absolute =
			path.startsWith("http://") || path.startsWith("https://")
				? path
				: new URL(path, window.location.origin).toString();
		try {
			await navigator.clipboard.writeText(absolute);
			setMessage("Review link copied.");
		} catch {
			setError(`Copy the review link manually: ${absolute}`);
		}
	}

	function toggle(setter: React.Dispatch<React.SetStateAction<Set<string>>>, id: string) {
		setter((previous) => {
			const next = new Set(previous);
			if (next.has(id)) next.delete(id);
			else next.add(id);
			return next;
		});
	}

	function selectVisible() {
		setSelected(new Set(visible.map((submission) => submission.id)));
	}

	function openBulkDecision(action: DecisionAction) {
		if (action !== "accept" && action !== "reject") return;
		setBulkAction(action);
		setSendEmail(true);
		setEmailSubject(previews[action].subject);
		setEmailText(previews[action].text);
	}

	async function confirmBulkDecision() {
		if (!bulkAction || (bulkAction !== "accept" && bulkAction !== "reject")) return;
		const result = await request(`/api/admin/events/${eventSlug}/review/decisions`, "POST", {
			submissionIds: [...selected],
			action: bulkAction,
			email: sendEmail ? { send: true, subject: emailSubject, text: emailText } : { send: false },
		});
		if (result) setBulkAction(null);
	}

	const notices = (
		<>
			{error ? <p className={noticeClasses("negative")}>{error}</p> : null}
			{message ? <p className={noticeClasses("positive")}>{message}</p> : null}
			{decisionMessage ? <p className={noticeClasses("warning")}>{decisionMessage}</p> : null}
			{committeeReviewPath ? (
				<div className={`${noticeClasses("warning")} flex flex-wrap items-center gap-2`}>
					<span>Copy this committee review link now. It is shown only after activation and cannot be recovered from this workspace: <code>{committeeReviewPath}</code></span>
					<Button size="sm" variant="secondary" onClick={() => void copyReviewPath(committeeReviewPath)}>Copy committee link</Button>
				</div>
			) : null}
			{issuedReviewPath ? (
				<div className={`${noticeClasses("warning")} flex flex-wrap items-center gap-2`}>
					<span>Copy this personal reviewer link now; it will not be shown again: <code>{issuedReviewPath}</code></span>
					<Button size="sm" variant="secondary" onClick={() => void copyReviewPath(issuedReviewPath)}>Copy reviewer link</Button>
				</div>
			) : null}
		</>
	);

	return (
		<AdminSectionShell
			ariaLabel="Review sections"
			mobileLabel="Review section"
			sections={SECTIONS}
			section={section}
			onSectionChange={setSection}
			notice={notices}
		>
			{section === "rounds" ? (
				<div className="space-y-6">
					<dl className="flex flex-wrap gap-x-8 gap-y-3 border-b border-neutral-800 pb-4 text-sm">
						<Summary label="Reviewable" value={summary.total} />
						<Summary label="Scored" value={summary.scored} />
						<Summary label="Accepted" value={summary.accepted} />
						<Summary label="Rejected" value={summary.rejected} />
					</dl>
					<p className="text-xs text-neutral-500">Criterion scores are kept separately and weighted aggregates retain their full precision.</p>

					<ul className="divide-y divide-neutral-800 border border-neutral-800">
						{plans.map((item) => (
							<li key={item.id}>
								<Link
									href={`/admin/events/${eventSlug}/review?plan=${item.id}`}
									className={`flex items-center justify-between gap-2 px-3 py-3 text-sm ${item.id === plan?.id ? "bg-emerald-500/5" : "hover:bg-neutral-900/60"}`}
								>
									<span className="text-neutral-200">{item.name}<span className="mt-1 block text-xs text-neutral-500">{item.scorecardSummary?.join(" · ") || "No scorecard criteria"}</span></span>
									<span className="text-right"><StatusPill tone={item.status === "active" ? "positive" : "neutral"}>{item.status}</StatusPill><span className="mt-1 block text-xs text-neutral-500">{roundDateRange(item)}{item.blindReview ? " · blind" : ""}</span></span>
								</Link>
							</li>
						))}
					</ul>

					{plan ? (
						<>
							<div className="flex flex-wrap gap-2">
								<input value={editedPlanName} onChange={(event) => setEditedPlanName(event.target.value)} className={INPUT_CLASSES} aria-label="Selected plan name" />
								<Button size="sm" variant="secondary" disabled={pending || !editedPlanName.trim()} onClick={() => void request(`/api/admin/events/${eventSlug}/evaluation/${plan.id}`, "PATCH", { name: editedPlanName })}>Rename</Button>
								{plan.status === "draft" ? <Button size="sm" variant="secondary" disabled={pending} onClick={() => void request(`/api/admin/events/${eventSlug}/evaluation/${plan.id}`, "DELETE")}>Delete draft</Button> : null}
							</div>
							<div className="grid gap-2 sm:grid-cols-2">
								<label className="text-xs text-neutral-400">Opens<input type="date" value={openDate} onChange={(event) => setOpenDate(event.target.value)} className={`mt-1 w-full ${INPUT_CLASSES}`} /></label>
								<label className="text-xs text-neutral-400">Closes<input type="date" value={closeDate} onChange={(event) => setCloseDate(event.target.value)} className={`mt-1 w-full ${INPUT_CLASSES}`} /></label>
								<label className="flex items-center gap-2 text-sm text-neutral-300"><input type="checkbox" checked={blindReview} onChange={(event) => setBlindReview(event.target.checked)} /> Blind review — hide author and co-author identity</label>
								<label className="text-xs text-neutral-400">Per-reviewer assignment cap<input value={assignmentCap} onChange={(event) => setAssignmentCap(event.target.value)} inputMode="numeric" placeholder="No cap" className={`mt-1 w-full ${INPUT_CLASSES}`} /></label>
								<Button size="sm" variant="secondary" disabled={pending || !openDate || !closeDate} onClick={() => void request(`/api/admin/events/${eventSlug}/evaluation/${plan.id}`, "PATCH", { openAt: dateTimestamp(openDate, false), closeAt: dateTimestamp(closeDate, true), blindReview, assignmentCap: assignmentCap ? Number(assignmentCap) : null })}>Save round settings</Button>
							</div>
						</>
					) : null}

					<div className="flex flex-wrap gap-2 border-t border-neutral-800 pt-4">
						<input value={planName} onChange={(event) => setPlanName(event.target.value)} className={INPUT_CLASSES} placeholder="New plan name" aria-label="New evaluation plan name" />
						<Button disabled={pending || !planName.trim()} onClick={async () => { if (await request(`/api/admin/events/${eventSlug}/evaluation`, "POST", { name: planName })) setPlanName(""); }}>Create draft round</Button>
						{plan && !active ? (
							<Button
								variant="secondary"
								disabled={pending}
								onClick={async () => {
									const result = await request(`/api/admin/events/${eventSlug}/evaluation/activate`, "POST", { planId: plan.id });
									const link = activationReviewPath(result);
									if (link) setCommitteeReviewPath(link.reviewPath);
									else if (result) setMessage("The plan is already active. Its earlier committee link cannot be recovered here; use named reviewer links below.");
								}}
							>
								Activate selected round
							</Button>
						) : null}
						{plan && active ? <Button variant="secondary" disabled={pending} onClick={() => void request(`/api/admin/events/${eventSlug}/evaluation/${plan.id}`, "PATCH", { status: "closed" })}>Close active plan</Button> : null}
					</div>
				</div>
			) : null}

			{section === "rubric" ? (
				!plan ? (
					<EmptyState title="No evaluation plan yet" description="Create a draft plan in Review rounds to define the rubric." />
				) : (
					<div className="space-y-4">
						<div className="flex flex-wrap items-end gap-2">
							<input value={criterionLabel} onChange={(event) => setCriterionLabel(event.target.value)} className={INPUT_CLASSES} placeholder="Criterion label" aria-label="Criterion label" />
							<select value={criterionType} onChange={(event) => setCriterionType(event.target.value as Criterion["type"])} className={INPUT_CLASSES} aria-label="Criterion type"><option value="numeric">Numeric rating</option><option value="dropdown">Dropdown</option><option value="text">Free text</option></select>
							<input value={criterionWeight} onChange={(event) => setCriterionWeight(event.target.value)} className={`${INPUT_CLASSES} w-20`} inputMode="decimal" aria-label="Criterion weight" />
							{criterionType === "dropdown" ? <textarea value={criterionOptions} onChange={(event) => setCriterionOptions(event.target.value)} className={INPUT_CLASSES} rows={3} aria-label="Dropdown options, one per line" /> : null}
							<Button disabled={pending || !criterionLabel.trim()} onClick={async () => { if (await request(`/api/admin/events/${eventSlug}/evaluation/${plan.id}/criteria`, "POST", { label: criterionLabel, weight: Number(criterionWeight), criterionType, options: criterionType === "dropdown" ? criterionOptions.split("\n") : undefined })) { setCriterionLabel(""); setCriterionWeight("1"); } }}>Add criterion</Button>
						</div>
						<ul className="divide-y divide-neutral-800 border border-neutral-800">
							{criteria.map((criterion) => (
								<CriterionItem
									key={criterion.id}
									criterion={criterion}
									disabled={pending}
									canRemove={criteria.length > 1}
									onSave={(body) => request(`/api/admin/events/${eventSlug}/evaluation/${plan.id}/criteria/${criterion.id}`, "PATCH", body)}
									onRemove={() => request(`/api/admin/events/${eventSlug}/evaluation/${plan.id}/criteria/${criterion.id}`, "DELETE")}
								/>
							))}
						</ul>
					</div>
				)
			) : null}

			{section === "reviewers" ? (
				!plan ? (
					<EmptyState title="No evaluation plan yet" description="Create a draft plan before inviting reviewers." />
				) : (
					<div className="space-y-4">
						<p className="text-xs text-neutral-500">Optional email sends the personal review link on create/regenerate. The plaintext link is still shown once for clipboard copy.{active ? " The committee link is not recoverable after activation. Regenerate a named reviewer link below when a reviewer needs a deliberate replacement." : ""}</p>
						{plan.status !== "closed" ? (
							<div className="flex flex-wrap gap-2">
								<input value={reviewerName} onChange={(event) => setReviewerName(event.target.value)} className={INPUT_CLASSES} placeholder="Reviewer name" aria-label="Reviewer name" />
								<input value={reviewerEmail} onChange={(event) => setReviewerEmail(event.target.value)} className={INPUT_CLASSES} placeholder="Email (optional)" aria-label="Reviewer email" type="email" />
								<Button
									disabled={pending || !reviewerName.trim()}
									onClick={async () => {
										const result = await request(`/api/admin/events/${eventSlug}/reviewers`, "POST", {
											planId: plan.id,
											name: reviewerName,
											email: reviewerEmail.trim() || null,
										});
										if (result) {
											setReviewerName("");
											setReviewerEmail("");
											const path = result.reviewer?.reviewPath ?? null;
											setIssuedReviewPath(path);
											if (path) await copyReviewPath(path);
										}
									}}
								>
									Generate invite
								</Button>
							</div>
						) : (
							<p className="text-xs text-amber-300">Activate this plan before issuing review links.</p>
						)}
						<ul className="divide-y divide-neutral-800 border border-neutral-800">
							{reviewers.map((reviewer) => (
								<li key={reviewer.id} className="flex flex-wrap items-center justify-between gap-3 px-3 py-3 text-sm">
									<div>
										<p className="font-medium text-neutral-200">{reviewer.name}{reviewer.revokedAt ? " · revoked" : ""}</p>
										<p className="mt-0.5 text-xs text-neutral-500">{reviewer.email ?? "no email"} · {reviewer.assigned} assigned · {reviewer.scored} submitted reviews</p>
									</div>
									{active && reviewer.revokedAt === null ? (
										<div className="flex flex-wrap gap-2">
											<Button
												size="sm"
												variant="secondary"
												disabled={pending}
												onClick={async () => {
													const result = await request(`/api/admin/events/${eventSlug}/reviewers`, "PATCH", {
														reviewerId: reviewer.id,
														planId: plan.id,
														action: "regenerate",
														email: reviewer.email,
													});
													const path = result?.reviewer?.reviewPath ?? null;
													if (!path) return;
													setIssuedReviewPath(path);
													await copyReviewPath(path);
												}}
											>
												Regenerate &amp; copy link
											</Button>
											<Button size="sm" variant="secondary" disabled={pending} onClick={() => void request(`/api/admin/events/${eventSlug}/reviewers`, "PATCH", { planId: plan.id, reviewerId: reviewer.id, action: "revoke" })}>Revoke</Button>
										</div>
									) : null}
								</li>
							))}
						</ul>
					</div>
				)
			) : null}

			{section === "assignments" ? (
				!plan ? (
					<EmptyState title="No evaluation plan yet" description="Create a draft plan before assigning proposals." />
				) : (
					<div className="space-y-4">
						{liveReviewers.length === 0 ? (
							<div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">
								No live reviewers yet. Open the Reviewers tab, add someone, copy their{" "}
								<code className="text-amber-50">/review?token=…</code> link, then come back
								here to assign proposals. An empty assignment list means an empty scoring board.
							</div>
						) : null}
						{liveReviewers.length > 0 &&
						submissions.length > 0 &&
						submissions.every((submission) => submission.assignedReviewerIds.length === 0) ? (
							<div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">
								Reviewers exist, but nothing is assigned. Select proposals below, tick reviewers,
								and Apply assignments — otherwise{" "}
								<code className="text-amber-50">/review</code> stays empty.
							</div>
						) : null}
						<div className="flex flex-wrap items-end gap-2">
							<input value={query} onChange={(event) => setQuery(event.target.value)} className={INPUT_CLASSES} placeholder="Search proposals" aria-label="Search proposals" />
							<select value={status} onChange={(event) => setStatus(event.target.value)} className={INPUT_CLASSES} aria-label="Filter proposals">
								<option value="all">All statuses</option>
								{[...new Set(submissions.map((submission) => submission.status))].map((value) => (
									<option key={value} value={value}>{value.replaceAll("_", " ")}</option>
								))}
							</select>
							<Button size="sm" variant="secondary" onClick={selectVisible}>Select visible</Button>
						</div>
						<p className="text-xs text-neutral-500">Selected proposals: {selected.size}. Bulk accept/reject can reuse one editable email for the whole selection.</p>

						{active ? (
							<div className="space-y-4 border-y border-neutral-800 py-4">
								<div className="space-y-2">
									<p className="text-xs font-medium uppercase tracking-wide text-neutral-500">Assign selected to</p>
									<ul className="max-h-48 divide-y divide-neutral-800 overflow-y-auto border border-neutral-800">
										{liveReviewers.map((reviewer) => (
											<li key={reviewer.id} className="flex items-center gap-2 px-3 py-2 text-sm">
												<input
													type="checkbox"
													id={`bulk-reviewer-${reviewer.id}`}
													checked={reviewersForBulk.has(reviewer.id)}
													onChange={() => toggle(setReviewersForBulk, reviewer.id)}
												/>
												<label htmlFor={`bulk-reviewer-${reviewer.id}`} className="text-neutral-300">{reviewer.name}</label>
											</li>
										))}
									</ul>
									<div className="flex flex-wrap gap-2">
										<Button size="sm" disabled={pending || selected.size === 0 || reviewersForBulk.size === 0} onClick={() => void request(`/api/admin/events/${eventSlug}/review/assignments`, "POST", { planId: plan.id, submissionIds: [...selected], reviewerIds: [...reviewersForBulk] })}>Apply assignments</Button>
										<Button size="sm" variant="secondary" disabled={pending || selected.size === 0} onClick={() => openBulkDecision("accept")}>Accept selected</Button>
										<Button size="sm" variant="secondary" disabled={pending || selected.size === 0} onClick={() => openBulkDecision("reject")}>Reject selected</Button>
									</div>
								</div>
								<div className="flex flex-wrap items-center gap-2">
									<input value={bulkLabel} onChange={(event) => setBulkLabel(event.target.value)} className={INPUT_CLASSES} placeholder="Label" aria-label="Bulk label" />
									<Button
										size="sm"
										variant="secondary"
										disabled={pending || selected.size === 0 || !bulkLabel.trim()}
										onClick={async () => {
											if (await request(`/api/admin/events/${eventSlug}/review/labels`, "POST", { submissionIds: [...selected], label: bulkLabel, action: "add" })) setBulkLabel("");
										}}
									>
										Add label
									</Button>
									<Button
										size="sm"
										variant="secondary"
										disabled={pending || selected.size === 0 || !bulkLabel.trim()}
										onClick={() => void request(`/api/admin/events/${eventSlug}/review/labels`, "POST", { submissionIds: [...selected], label: bulkLabel, action: "remove" })}
									>
										Remove label
									</Button>
								</div>
								{bulkAction ? (
									<div className="space-y-3 border-t border-neutral-800 pt-4 text-left">
										<p className="text-xs font-medium uppercase tracking-wide text-neutral-500">
											Confirm {DECISION_REGISTRY[bulkAction].label.toLowerCase()} for {selected.size} selected
										</p>
										<label className="flex items-center gap-2 text-sm text-neutral-300">
											<input type="checkbox" checked={sendEmail} onChange={(event) => setSendEmail(event.target.checked)} className="accent-emerald-500" />
											Send the same email to each submitter
										</label>
										{sendEmail ? (
											<div className="space-y-2">
												<label className="block text-xs text-neutral-400">
													Subject
													<input value={emailSubject} onChange={(event) => setEmailSubject(event.target.value)} className={`mt-1 w-full ${INPUT_CLASSES}`} />
												</label>
												<label className="block text-xs text-neutral-400">
													Body
													<textarea value={emailText} onChange={(event) => setEmailText(event.target.value)} rows={7} className={`mt-1 w-full ${INPUT_CLASSES} font-mono text-xs`} />
												</label>
											</div>
										) : (
											<p className="text-xs text-neutral-500">Status changes without sending email.</p>
										)}
										<div className="flex gap-2">
											<Button
												size="sm"
												disabled={pending || (sendEmail && (!emailSubject.trim() || !emailText.trim()))}
												onClick={() => void confirmBulkDecision()}
											>
												{sendEmail
													? `${DECISION_REGISTRY[bulkAction].label} + send email`
													: `${DECISION_REGISTRY[bulkAction].label} without email`}
											</Button>
											<Button size="sm" variant="secondary" disabled={pending} onClick={() => setBulkAction(null)}>Cancel</Button>
										</div>
									</div>
								) : null}
							</div>
						) : (
							<p className="text-xs text-amber-300">Activate this plan before assigning or deciding in bulk.</p>
						)}

						<ul className="divide-y divide-neutral-800 border border-neutral-800">
							{visible.map((submission) => (
								<li key={submission.id} className="flex items-center gap-3 px-3 py-3 text-sm">
									<input type="checkbox" checked={selected.has(submission.id)} onChange={() => toggle(setSelected, submission.id)} aria-label={`Select ${submission.title}`} />
									<div className="min-w-0 flex-1">
										<p className="truncate font-medium text-neutral-200">{submission.title}</p>
										<p className="truncate text-xs text-neutral-500">Submitted by {submission.submitter} · {submission.assignedReviewerIds.length} assigned · {submission.criterionScoreCount} criterion scores</p>
										<p className="mt-1 text-xs text-neutral-400">
											<span className="font-medium text-neutral-300">Presenters:</span>{" "}
											{submission.speakers.length > 0
												? submission.speakers.map((speaker) => `${speaker.name} <${speaker.email}> (${speaker.status})`).join(" · ")
												: "No presenters attached"}
										</p>
									</div>
									<StatusPill tone={submissionStatusTone(submission.status)}>{submission.status.replaceAll("_", " ")}</StatusPill>
								</li>
							))}
						</ul>
					</div>
				)
			) : null}

			{section === "scores" ? (
				!plan ? (
					<EmptyState title="No evaluation plan yet" description="Scores appear once you have an active plan and reviewer submissions." />
				) : (
					<div className="space-y-4">
						<div className="flex flex-wrap gap-2">
							<a
								href={`/api/admin/events/${eventSlug}/export/scores.csv?plan=${plan.id}`}
								className={buttonClasses("secondary")}
							>
								Export scores CSV
							</a>
							<Button
								size="sm"
								variant="secondary"
								disabled={pending || !active}
								onClick={() => void request(`/api/admin/events/${eventSlug}/review/reminders`, "POST", { planId: plan.id })}
							>
								Remind outstanding reviewers
							</Button>
						</div>
						{matrix.submissions.length === 0 || matrix.reviewers.length === 0 ? (
							<p className="text-sm text-neutral-500">Scores appear here once reviewers submit reviews.</p>
						) : (
							<div className="overflow-x-auto border border-neutral-800">
								<table className="min-w-full border-collapse text-left text-xs">
									<thead>
										<tr className="border-b border-neutral-800 text-neutral-500">
											<th className="px-2 py-2 font-medium">
												<button type="button" className="hover:text-neutral-200" onClick={() => toggleMatrixSort("title")}>
													Proposal{matrixSortKey === "title" ? (matrixSortDir === "asc" ? " ↑" : " ↓") : ""}
												</button>
											</th>
											<th className="px-2 py-2 font-medium">
												<button type="button" className="hover:text-neutral-200" onClick={() => toggleMatrixSort("status")}>
													Status{matrixSortKey === "status" ? (matrixSortDir === "asc" ? " ↑" : " ↓") : ""}
												</button>
											</th>
											{matrix.reviewers.map((reviewer) => (
												<th key={reviewer.id} className="px-2 py-2 font-medium">{reviewer.name}</th>
											))}
											<th className="px-2 py-2 font-medium">
												<button type="button" className="hover:text-neutral-200" onClick={() => toggleMatrixSort("avg")}>
													Avg{matrixSortKey === "avg" ? (matrixSortDir === "asc" ? " ↑" : " ↓") : ""}
												</button>
											</th>
										</tr>
									</thead>
									<tbody>
										{sortedMatrixRows.map((submission) => (
											<tr key={submission.id} className="border-b border-neutral-900/80">
												<td className="max-w-[14rem] truncate px-2 py-2 text-neutral-200">{submission.title}</td>
												<td className="px-2 py-2 text-neutral-400">{submission.status.replaceAll("_", " ")}</td>
												{matrix.reviewers.map((reviewer) => {
													const cell = matrix.cells[submission.id]?.[reviewer.id];
													const feedback = cell
														? matrix.criteria.flatMap((criterion) => {
																const result = cell.byCriterion[criterion.id];
																return result && (result.value !== null || result.comment)
																	? [{ criterion, result }]
																	: [];
															})
														: [];
													return (
														<td key={reviewer.id} className="min-w-52 px-2 py-2 align-top text-neutral-300">
															<p className="font-medium tabular-nums text-neutral-100">{cell?.aggregate === null || cell?.aggregate === undefined ? "—" : String(cell.aggregate)}</p>
															{cell?.comment ? <p className="mt-1 whitespace-pre-wrap text-[11px] leading-4 text-neutral-400"><span className="text-neutral-500">Overall:</span> {cell.comment}</p> : null}
															{feedback.length > 0 ? (
																<ul className="mt-1 space-y-1 text-[11px] leading-4 text-neutral-400">
																	{feedback.map(({ criterion, result }) => (
																		<li key={criterion.id}>
																			<span className="text-neutral-500">{criterion.label}:</span>{" "}
																			{result.value ?? "—"}
																			{result.comment ? <span className="block whitespace-pre-wrap text-neutral-500">Comment: {result.comment}</span> : null}
																		</li>
																	))}
																</ul>
															) : null}
														</td>
													);
												})}
												<td className="px-2 py-2 tabular-nums text-neutral-200">
													{submission.average === null ? "—" : String(submission.average)}
												</td>
											</tr>
										))}
									</tbody>
								</table>
							</div>
						)}
					</div>
				)
			) : null}
		</AdminSectionShell>
	);
}

function Summary({ label, value }: { label: string; value: number }) {
	return (
		<div>
			<dt className="text-xs text-neutral-500">{label}</dt>
			<dd className="mt-0.5 text-lg font-medium tabular-nums text-neutral-100">{value}</dd>
		</div>
	);
}

function CriterionItem({
	criterion,
	disabled,
	canRemove,
	onSave,
	onRemove,
}: {
	criterion: Criterion;
	disabled: boolean;
	canRemove: boolean;
	onSave: (body: { label: string; description: string | null; weight: number; scaleMin: number; scaleMax: number }) => Promise<unknown>;
	onRemove: () => Promise<unknown>;
}) {
	const [label, setLabel] = useState(criterion.label);
	const [description, setDescription] = useState(criterion.description ?? "");
	const [weight, setWeight] = useState(String(criterion.weight));
	const [scaleMin, setScaleMin] = useState(String(criterion.scaleMin));
	const [scaleMax, setScaleMax] = useState(String(criterion.scaleMax));
	const scaleMinValue = Number(scaleMin);
	const scaleMaxValue = Number(scaleMax);
	const weightValue = Number(weight);
	const canSave = Boolean(label.trim()) && Number.isFinite(weightValue) && Number.isInteger(scaleMinValue) && Number.isInteger(scaleMaxValue) && scaleMinValue < scaleMaxValue;
	return (
		<li className="space-y-2 px-3 py-3 text-sm">
			<div className="flex flex-wrap items-center justify-between gap-3">
				<div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
					<input value={label} onChange={(event) => setLabel(event.target.value)} className={`${INPUT_CLASSES} min-w-44 flex-1`} aria-label={`${criterion.label} label`} disabled={disabled} />
					<span className="text-xs text-neutral-500">{criterion.type === "numeric" ? "Numeric rating" : criterion.type === "dropdown" ? "Dropdown" : "Free text"}</span>
					<input value={weight} onChange={(event) => setWeight(event.target.value)} className={`${INPUT_CLASSES} w-20`} inputMode="decimal" aria-label={`${criterion.label} weight`} disabled={disabled} />
					<input value={scaleMin} onChange={(event) => setScaleMin(event.target.value)} className={`${INPUT_CLASSES} w-16`} inputMode="numeric" aria-label={`${criterion.label} scale min`} disabled={disabled} />
					<span className="text-xs text-neutral-500">to</span>
					<input value={scaleMax} onChange={(event) => setScaleMax(event.target.value)} className={`${INPUT_CLASSES} w-16`} inputMode="numeric" aria-label={`${criterion.label} scale max`} disabled={disabled} />
				</div>
				<div className="flex gap-2">
					<Button size="sm" variant="secondary" disabled={disabled || !canSave} onClick={() => void onSave({ label, description: description.trim() || null, weight: weightValue, scaleMin: scaleMinValue, scaleMax: scaleMaxValue })}>Save</Button>
					<Button size="sm" variant="secondary" disabled={disabled || !canRemove} onClick={() => void onRemove()}>Remove</Button>
				</div>
			</div>
			<input value={description} onChange={(event) => setDescription(event.target.value)} className={INPUT_CLASSES} placeholder="Optional description" aria-label={`${criterion.label} description`} disabled={disabled} />
			{criterion.type === "dropdown" ? <p className="text-xs text-neutral-500">Options: {criterion.options.join(" · ")}</p> : null}
		</li>
	);
}

function dateInputValue(timestamp: number | null): string {
	return timestamp === null ? "" : new Date(timestamp).toISOString().slice(0, 10);
}

function dateTimestamp(value: string, endOfDay: boolean): number | null {
	if (!value) return null;
	return Date.parse(`${value}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}Z`);
}

function roundDateRange(plan: Pick<Plan, "openAt" | "closeAt">): string {
	if (plan.openAt === null && plan.closeAt === null) return "Dates not set";
	const format = (value: number | null) => value === null ? "open" : new Date(value).toISOString().slice(0, 10);
	return `${format(plan.openAt)} → ${format(plan.closeAt)}`;
}
