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
		<div className="space-y-3">
			<ul className="divide-y divide-neutral-800 border-y border-neutral-800">
				{reviewers.map((reviewer) => {
					const active = selected.has(reviewer.id);
					return (
						<li key={reviewer.id}>
							<label className="flex cursor-pointer items-center gap-3 py-2.5 text-sm text-neutral-300">
								<input
									type="checkbox"
									checked={active}
									disabled={pending}
									onChange={() => toggle(reviewer.id)}
									className="rounded border-neutral-600 bg-neutral-950 text-neutral-100 focus:ring-neutral-500"
								/>
								<span className={active ? "text-neutral-100" : "text-neutral-400"}>
									{reviewer.name}
								</span>
							</label>
						</li>
					);
				})}
			</ul>
			{dirty ? (
				<div>
					<Button
						size="sm"
						variant="secondary"
						disabled={pending}
						onClick={() => void save()}
					>
						{pending ? "Saving…" : "Save assignments"}
					</Button>
				</div>
			) : null}
			{error ? <p className="text-xs text-red-400">{error}</p> : null}
		</div>
	);
}
