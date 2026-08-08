"use client";

import { useState } from "react";

type Props = {
	eventSlug: string;
};

export function ActivatePlanButton({ eventSlug }: Props) {
	const [error, setError] = useState<string | null>(null);
	const [reviewPath, setReviewPath] = useState<string | null>(null);
	const [pending, setPending] = useState(false);

	async function onClick() {
		setPending(true);
		setError(null);
		try {
			const response = await fetch(
				`/api/admin/events/${eventSlug}/evaluation/activate`,
				{
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({ name: "Default review" }),
				},
			);
			const data = (await response.json()) as {
				ok?: boolean;
				error?: string;
				plan?: { reviewPath?: string; reviewerToken?: string };
			};
			if (!response.ok || !data.ok || !data.plan?.reviewPath) {
				setError(data.error ?? "Activate failed");
				return;
			}
			setReviewPath(data.plan.reviewPath);
		} catch {
			setError("Network error");
		} finally {
			setPending(false);
		}
	}

	return (
		<div className="space-y-1 text-sm">
			<button
				type="button"
				onClick={() => void onClick()}
				disabled={pending}
				className="underline disabled:opacity-40"
			>
				{pending ? "Activating…" : "Activate evaluation plan"}
			</button>
			{reviewPath ? (
				<p>
					Review:{" "}
					<a className="underline" href={reviewPath}>
						{reviewPath}
					</a>
				</p>
			) : null}
			{error ? <p className="text-xs text-red-700">{error}</p> : null}
		</div>
	);
}
