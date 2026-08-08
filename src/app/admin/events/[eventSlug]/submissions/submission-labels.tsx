"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Props = {
	eventSlug: string;
	submissionId: string;
	labels: string[];
};

export function SubmissionLabels({ eventSlug, submissionId, labels }: Props) {
	const router = useRouter();
	const [adding, setAdding] = useState(false);
	const [draft, setDraft] = useState("");
	const [pending, setPending] = useState(false);
	const [error, setError] = useState<string | null>(null);

	async function mutate(method: "POST" | "DELETE", label: string) {
		setPending(true);
		setError(null);
		try {
			const response = await fetch(
				`/api/admin/events/${eventSlug}/submissions/${submissionId}/labels`,
				{
					method,
					headers: { "content-type": "application/json" },
					body: JSON.stringify({ label }),
				},
			);
			const data = (await response.json()) as { ok?: boolean; error?: string };
			if (!response.ok || !data.ok) {
				setError(data.error ?? "Label update failed");
				return;
			}
			setDraft("");
			setAdding(false);
			router.refresh();
		} catch {
			setError("Network error");
		} finally {
			setPending(false);
		}
	}

	return (
		<div className="flex flex-wrap items-center gap-1.5">
			{labels.map((label) => (
				<span
					key={label}
					className="inline-flex items-center gap-1 rounded-md border border-neutral-700 bg-neutral-900 px-2 py-0.5 text-xs text-neutral-300"
				>
					{label}
					<button
						type="button"
						disabled={pending}
						onClick={() => void mutate("DELETE", label)}
						aria-label={`Remove label ${label}`}
						className="text-neutral-500 hover:text-neutral-200 disabled:opacity-40"
					>
						×
					</button>
				</span>
			))}
			{adding ? (
				<form
					className="inline-flex items-center gap-1"
					onSubmit={(event) => {
						event.preventDefault();
						if (draft.trim()) void mutate("POST", draft);
					}}
				>
					<input
						autoFocus
						value={draft}
						onChange={(e) => setDraft(e.target.value)}
						onKeyDown={(e) => {
							if (e.key === "Escape") {
								setAdding(false);
								setDraft("");
							}
						}}
						maxLength={40}
						placeholder="label"
						className="w-28 rounded-md border border-neutral-700 bg-neutral-900 px-2 py-0.5 text-xs text-neutral-100 placeholder:text-neutral-500"
						disabled={pending}
					/>
					<button
						type="submit"
						disabled={pending || !draft.trim()}
						className="rounded-md border border-neutral-700 bg-neutral-900 px-1.5 py-0.5 text-xs text-neutral-300 hover:bg-neutral-800 disabled:opacity-40"
					>
						{pending ? "…" : "Add"}
					</button>
				</form>
			) : (
				<button
					type="button"
					onClick={() => setAdding(true)}
					className="rounded-md border border-dashed border-neutral-700 px-2 py-0.5 text-xs text-neutral-500 hover:border-neutral-500 hover:text-neutral-300"
				>
					+ label
				</button>
			)}
			{error ? <span className="text-xs text-red-400">{error}</span> : null}
		</div>
	);
}
