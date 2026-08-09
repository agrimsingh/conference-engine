"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { activationReviewPath } from "../review/activation-result";

type Props = {
	eventSlug: string;
	planActive?: boolean;
};

export function ActivatePlanButton({ eventSlug, planActive = false }: Props) {
	const router = useRouter();
	const [error, setError] = useState<string | null>(null);
	const [reviewPath, setReviewPath] = useState<string | null>(null);
	const [alreadyActive, setAlreadyActive] = useState(false);
	const [pending, setPending] = useState(false);

	const adminReviewHref = `/admin/events/${eventSlug}/review`;

	if (planActive || alreadyActive) {
		return (
			<div className="space-y-1 text-sm">
				<Link
					href={adminReviewHref}
					className="font-medium text-neutral-200 underline underline-offset-2"
				>
					Open review board
				</Link>
				<p className="text-xs text-neutral-500">
					Plan is active. The committee link is one-shot and cannot be recovered here.
				</p>
			</div>
		);
	}

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
			};
			if (!response.ok || !data.ok) {
				setError(data.error ?? "Activate failed");
				return;
			}
			const link = activationReviewPath(data);
			if (link) {
				setReviewPath(link.reviewPath);
				return;
			}
			setAlreadyActive(true);
			router.refresh();
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
				className="font-medium text-neutral-200 underline underline-offset-2 disabled:opacity-40"
			>
				{pending ? "Opening review…" : "Open review board"}
			</button>
			{reviewPath ? (
				<p className="text-neutral-400">
					Share with reviewers:{" "}
					<a
						className="font-medium text-neutral-200 underline underline-offset-2"
						href={reviewPath}
					>
						{reviewPath}
					</a>
				</p>
			) : null}
			{error ? <p className="text-xs text-red-400">{error}</p> : null}
		</div>
	);
}
