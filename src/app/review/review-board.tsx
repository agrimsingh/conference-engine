"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { DecisionButtons } from "@/components/decision-buttons";
import {
	buttonClasses,
	EmptyState,
	INPUT_CLASSES,
	noticeClasses,
	StatusPill,
	submissionStatusTone,
} from "@/components/ui";
import type { DecisionAction, RenderedMessage } from "@/lib/domain";

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
	previews: Record<DecisionAction, RenderedMessage>;
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

	if (!submissions.length) {
		return (
			<EmptyState
				title="No submissions to review"
				description="Once speakers submit talks, they show up here for scoring."
			/>
		);
	}

	return (
		<div className="space-y-4">
			{error ? <p className={noticeClasses("negative")}>{error}</p> : null}
			<ul className="divide-y divide-neutral-800 rounded-lg border border-neutral-800 bg-neutral-900">
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
									<p className="font-medium text-neutral-100">{row.title}</p>
									<p className="mt-1 text-neutral-400">
										{row.submitterName} · {row.submitterEmail}
									</p>
								</div>
								<StatusPill tone={submissionStatusTone(row.status)}>
									{row.status.replaceAll("_", " ")}
									{avg !== null ? ` · avg ${avg.toFixed(1)}` : ""}
								</StatusPill>
							</div>

							{row.scores.length > 0 ? (
								<ul className="space-y-1 text-xs text-neutral-400">
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
									className="inline-flex rounded-lg border border-neutral-800 bg-neutral-950/60 p-0.5"
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
														? "min-w-10 rounded-md bg-neutral-800 px-3 py-2 text-sm font-semibold tabular-nums text-neutral-100"
														: "min-w-10 rounded-md px-3 py-2 text-sm font-medium tabular-nums text-neutral-400 hover:text-neutral-100 disabled:opacity-40"
												}
											>
												{n}
											</button>
										);
									})}
								</div>
								<div className="flex flex-wrap items-end gap-2">
									<label className="min-w-[12rem] flex-1 text-xs text-neutral-400">
										Comment (optional)
										<input
											value={comments[row.id] ?? ""}
											onChange={(e) =>
												setComments((prev) => ({
													...prev,
													[row.id]: e.target.value,
												}))
											}
											className={`mt-1 w-full ${INPUT_CLASSES} py-1.5`}
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
										className={buttonClasses("secondary")}
									>
										{busy ? "Saving…" : "Save score"}
									</button>
								</div>
							</div>

							{canDecide ? (
								<div className="border-t border-neutral-800 pt-3">
									<DecisionButtons
										eventSlug={eventSlug}
										submissionId={row.id}
										status={row.status}
										previews={row.previews}
									/>
								</div>
							) : null}
						</li>
					);
				})}
			</ul>
		</div>
	);
}
