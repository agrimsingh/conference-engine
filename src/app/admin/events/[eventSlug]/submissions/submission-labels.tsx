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
		<div className="space-y-3">
			{labels.length > 0 ? (
				<ul className="divide-y divide-neutral-800 border-y border-neutral-800">
					{labels.map((label) => (
						<li
							key={label}
							className="flex items-center justify-between gap-3 py-2.5 text-sm text-neutral-300"
						>
							<span>{label}</span>
							<button
								type="button"
								disabled={pending}
								onClick={() => void mutate("DELETE", label)}
								aria-label={`Remove label ${label}`}
								className="text-xs text-neutral-500 hover:text-neutral-200 disabled:opacity-40"
							>
								Remove
							</button>
						</li>
					))}
				</ul>
			) : (
				<p className="text-sm text-neutral-500">No labels yet.</p>
			)}
			{adding ? (
				<form
					className="flex flex-wrap items-end gap-2"
					onSubmit={(event) => {
						event.preventDefault();
						if (draft.trim()) void mutate("POST", draft);
					}}
				>
					<label className="block text-xs text-neutral-400">
						Label
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
							className="mt-1 w-40 rounded-md border border-neutral-700 bg-neutral-950 px-2 py-1.5 text-sm text-neutral-100 placeholder:text-neutral-500"
							disabled={pending}
						/>
					</label>
					<button
						type="submit"
						disabled={pending || !draft.trim()}
						className="rounded-md border border-neutral-700 px-2 py-1.5 text-xs text-neutral-300 hover:bg-neutral-900 disabled:opacity-40"
					>
						{pending ? "…" : "Add"}
					</button>
					<button
						type="button"
						disabled={pending}
						onClick={() => {
							setAdding(false);
							setDraft("");
						}}
						className="text-xs text-neutral-500 hover:text-neutral-300"
					>
						Cancel
					</button>
				</form>
			) : (
				<div>
					<button
						type="button"
						onClick={() => setAdding(true)}
						className="text-xs text-neutral-500 underline underline-offset-2 hover:text-neutral-300"
					>
						+ Add label
					</button>
				</div>
			)}
			{error ? <p className="text-xs text-red-400">{error}</p> : null}
		</div>
	);
}
