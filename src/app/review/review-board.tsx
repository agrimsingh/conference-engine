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
	const [picked, setPicked] = useState<Record<string, number>>({});
	const [comments, setComments] = useState<Record<string, string>>({});

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
		return (
			<div className="rounded-lg border border-dashed border-neutral-300 bg-neutral-50 px-4 py-10 text-center">
				<p className="text-sm font-medium text-neutral-900">
					No submissions to review
				</p>
				<p className="mt-1 text-sm text-neutral-600">
					Once speakers submit talks, they show up here for scoring.
				</p>
			</div>
		);
	}

	return (
		<div className="space-y-4">
			{error ? (
				<p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
					{error}
				</p>
			) : null}
			<ul className="divide-y divide-neutral-200 rounded-lg border border-neutral-200 bg-white">
				{submissions.map((row) => {
					const busy = pendingId === row.id;
					const avg =
						row.scores.length > 0
							? row.scores.reduce((sum, s) => sum + s.score, 0) / row.scores.length
							: null;
					const selected = picked[row.id] ?? 3;
					return (
						<li key={row.id} className="space-y-3 px-4 py-4 text-sm">
							<div className="flex flex-wrap items-start justify-between gap-3">
								<div>
									<p className="font-medium text-neutral-900">{row.title}</p>
									<p className="mt-1 text-neutral-600">
										{row.submitterName} · {row.submitterEmail}
									</p>
								</div>
								<span className="rounded-md bg-neutral-100 px-2 py-0.5 text-xs font-medium uppercase tracking-wide text-neutral-700">
									{row.status.replaceAll("_", " ")}
									{avg !== null ? ` · avg ${avg.toFixed(1)}` : ""}
								</span>
							</div>

							{row.scores.length > 0 ? (
								<ul className="space-y-1 text-xs text-neutral-600">
									{row.scores.map((s) => (
										<li key={s.id}>
											{s.scoredBy}: {s.score}/5
											{s.comment ? ` — ${s.comment}` : ""}
										</li>
									))}
								</ul>
							) : null}

							<div className="space-y-2">
								<p className="text-xs font-medium uppercase tracking-wide text-neutral-500">
									Your score
								</p>
								<div
									className="inline-flex rounded-lg border border-neutral-300 bg-neutral-50 p-0.5"
									role="group"
									aria-label={`Score for ${row.title}`}
								>
									{[1, 2, 3, 4, 5].map((n) => {
										const active = selected === n;
										return (
											<button
												key={n}
												type="button"
												disabled={busy}
												onClick={() =>
													setPicked((prev) => ({ ...prev, [row.id]: n }))
												}
												className={
													active
														? "min-w-10 rounded-md bg-neutral-900 px-3 py-2 text-sm font-semibold tabular-nums text-white"
														: "min-w-10 rounded-md px-3 py-2 text-sm font-medium tabular-nums text-neutral-700 hover:bg-white disabled:opacity-40"
												}
											>
												{n}
											</button>
										);
									})}
								</div>
								<div className="flex flex-wrap items-end gap-2">
									<label className="min-w-[12rem] flex-1 text-xs text-neutral-600">
										Comment (optional)
										<input
											value={comments[row.id] ?? ""}
											onChange={(e) =>
												setComments((prev) => ({
													...prev,
													[row.id]: e.target.value,
												}))
											}
											className="mt-1 w-full rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
											disabled={busy}
										/>
									</label>
									<button
										type="button"
										disabled={busy}
										onClick={() =>
											void scoreSubmission(
												row.id,
												selected,
												comments[row.id] ?? "",
											)
										}
										className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-40"
									>
										{busy ? "Saving…" : "Save score"}
									</button>
								</div>
							</div>

							{canDecide &&
							(row.status === "submitted" ||
								row.status === "under_review" ||
								row.status === "accepted" ||
								row.status === "rejected") ? (
								<div className="flex gap-2 border-t border-neutral-100 pt-3">
									{(row.status === "submitted" ||
										row.status === "under_review" ||
										row.status === "accepted") && (
										<button
											type="button"
											disabled={busy || row.status === "accepted"}
											onClick={() => void decide(row.id, "accept")}
											className="rounded-md bg-emerald-800 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40"
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
											className="rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-xs font-medium text-neutral-800 disabled:opacity-40"
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
