"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui";

export type AssignmentReviewerOption = {
	id: string;
	name: string;
};

type Props = {
	eventSlug: string;
	submissionId: string;
	reviewers: AssignmentReviewerOption[];
	assignedReviewerIds: string[];
};

export function AssignmentControls({
	eventSlug,
	submissionId,
	reviewers,
	assignedReviewerIds,
}: Props) {
	const router = useRouter();
	const [selected, setSelected] = useState(() => new Set(assignedReviewerIds));
	const [pending, setPending] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const dirty =
		selected.size !== assignedReviewerIds.length ||
		assignedReviewerIds.some((id) => !selected.has(id));

	function toggle(id: string) {
		setSelected((prev) => {
			const next = new Set(prev);
			if (next.has(id)) next.delete(id);
			else next.add(id);
			return next;
		});
	}

	async function save() {
		setPending(true);
		setError(null);
		try {
			const response = await fetch(
				`/api/admin/events/${eventSlug}/submissions/${submissionId}/assignments`,
				{
					method: "PUT",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({ reviewerIds: [...selected] }),
				},
			);
			const data = (await response.json()) as { ok?: boolean; error?: string };
			if (!response.ok || !data.ok) {
				setError(data.error ?? "Assignment update failed");
				return;
			}
			router.refresh();
		} catch {
			setError("Network error");
		} finally {
			setPending(false);
		}
	}

	if (reviewers.length === 0) {
		return (
			<p className="text-xs text-neutral-500">
				No named reviewers on the active plan.
			</p>
		);
	}

	return (
		<div className="space-y-1.5">
			<p className="text-xs font-medium uppercase tracking-wide text-neutral-500">
				Assigned reviewers
			</p>
			<div className="flex flex-wrap items-center gap-1.5">
				{reviewers.map((reviewer) => {
					const active = selected.has(reviewer.id);
					return (
						<button
							key={reviewer.id}
							type="button"
							disabled={pending}
							onClick={() => toggle(reviewer.id)}
							className={
								active
									? "inline-flex items-center rounded-md border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-xs text-emerald-300 disabled:opacity-40"
									: "inline-flex items-center rounded-md border border-neutral-800 bg-neutral-900 px-2 py-0.5 text-xs text-neutral-500 hover:border-neutral-600 hover:text-neutral-300 disabled:opacity-40"
							}
						>
							{reviewer.name}
						</button>
					);
				})}
				{dirty ? (
					<Button
						size="sm"
						variant="secondary"
						disabled={pending}
						onClick={() => void save()}
					>
						{pending ? "Saving…" : "Save"}
					</Button>
				) : null}
			</div>
			{error ? <p className="text-xs text-red-400">{error}</p> : null}
		</div>
	);
}
