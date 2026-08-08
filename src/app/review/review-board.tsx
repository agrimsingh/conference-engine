"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type ScoreView = {
	id: string;
	score: number;
	comment: string | null;
	scoredBy: string;
};

type SubmissionView = {
	id: string;
	status: string;
	submitterName: string | null;
	submitterEmail: string | null;
	title: string;
	scores: ScoreView[];
};

type Props = {
	eventSlug: string;
	token: string;
	canDecide: boolean;
	submissions: SubmissionView[];
};

export function ReviewBoard({ eventSlug, token, canDecide, submissions }: Props) {
	const router = useRouter();
	const [error, setError] = useState<string | null>(null);
	const [pendingId, setPendingId] = useState<string | null>(null);

	async function scoreSubmission(
		submissionId: string,
		score: number,
		comment: string,
	) {
		setPendingId(submissionId);
		setError(null);
		try {
			const response = await fetch("/api/review/score", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({
					token,
					eventSlug,
					submissionId,
					score,
					comment,
					scoredBy: "reviewer",
				}),
			});
			const data = (await response.json()) as { ok?: boolean; error?: string };
			if (!response.ok || !data.ok) {
				setError(data.error ?? "Score failed");
				return;
			}
			router.refresh();
		} catch {
			setError("Network error");
		} finally {
			setPendingId(null);
		}
	}

	async function decide(submissionId: string, action: "accept" | "reject") {
		setPendingId(submissionId);
		setError(null);
		try {
			const response = await fetch(
				`/api/admin/events/${eventSlug}/submissions/${submissionId}/${action}`,
				{ method: "POST" },
			);
			const data = (await response.json()) as { ok?: boolean; error?: string };
			if (!response.ok || !data.ok) {
				setError(data.error ?? `${action} failed`);
				return;
			}
			router.refresh();
		} catch {
			setError("Network error");
		} finally {
			setPendingId(null);
		}
	}

	if (!submissions.length) {
		return <p className="text-sm text-neutral-600">No submissions to review.</p>;
	}

	return (
		<div className="space-y-4">
			{error ? <p className="text-sm text-red-700">{error}</p> : null}
			<ul className="divide-y divide-neutral-200 rounded border border-neutral-200 bg-white">
				{submissions.map((row) => {
					const busy = pendingId === row.id;
					const avg =
						row.scores.length > 0
							? row.scores.reduce((sum, s) => sum + s.score, 0) / row.scores.length
							: null;
					return (
						<li key={row.id} className="space-y-3 px-4 py-4 text-sm">
							<div className="flex flex-wrap items-start justify-between gap-3">
								<div>
									<p className="font-medium">{row.title}</p>
									<p className="mt-1 text-neutral-600">
										{row.submitterName} · {row.submitterEmail}
									</p>
									<p className="mt-1 font-mono text-xs text-neutral-500">{row.id}</p>
								</div>
								<span className="rounded bg-neutral-100 px-2 py-0.5 text-xs uppercase tracking-wide">
									{row.status}
									{avg !== null ? ` · avg ${avg.toFixed(1)}` : ""}
								</span>
							</div>

							{row.scores.length > 0 ? (
								<ul className="space-y-1 text-xs text-neutral-700">
									{row.scores.map((s) => (
										<li key={s.id}>
											{s.scoredBy}: {s.score}/5
											{s.comment ? ` — ${s.comment}` : ""}
										</li>
									))}
								</ul>
							) : null}

							<form
								className="flex flex-wrap items-end gap-2"
								onSubmit={(event) => {
									event.preventDefault();
									const form = new FormData(event.currentTarget);
									const score = Number(form.get("score"));
									const comment = String(form.get("comment") ?? "");
									void scoreSubmission(row.id, score, comment);
								}}
							>
								<label className="text-xs">
									Score
									<select
										name="score"
										defaultValue="3"
										className="ml-1 rounded border border-neutral-300 px-2 py-1"
										disabled={busy}
									>
										{[1, 2, 3, 4, 5].map((n) => (
											<option key={n} value={n}>
												{n}
											</option>
										))}
									</select>
								</label>
								<label className="min-w-[12rem] flex-1 text-xs">
									Comment
									<input
										name="comment"
										className="ml-1 w-full rounded border border-neutral-300 px-2 py-1"
										disabled={busy}
									/>
								</label>
								<button
									type="submit"
									disabled={busy}
									className="rounded bg-neutral-900 px-3 py-1 text-xs text-white disabled:opacity-40"
								>
									{busy ? "Saving…" : "Save score"}
								</button>
							</form>

							{canDecide &&
							(row.status === "submitted" ||
								row.status === "under_review" ||
								row.status === "accepted" ||
								row.status === "rejected") ? (
								<div className="flex gap-2">
									{(row.status === "submitted" ||
										row.status === "under_review" ||
										row.status === "accepted") && (
										<button
											type="button"
											disabled={busy || row.status === "accepted"}
											onClick={() => void decide(row.id, "accept")}
											className="rounded bg-emerald-800 px-3 py-1 text-xs text-white disabled:opacity-40"
										>
											Accept
										</button>
									)}
									{(row.status === "submitted" ||
										row.status === "under_review" ||
										row.status === "accepted" ||
										row.status === "rejected") && (
										<button
											type="button"
											disabled={busy || row.status === "rejected"}
											onClick={() => void decide(row.id, "reject")}
											className="rounded bg-red-800 px-3 py-1 text-xs text-white disabled:opacity-40"
										>
											Reject
										</button>
									)}
								</div>
							) : null}
						</li>
					);
				})}
			</ul>
		</div>
	);
}
