"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Props = {
	eventSlug: string;
	submissionId: string;
	disabled?: boolean;
};

export function RejectButton({ eventSlug, submissionId, disabled }: Props) {
	const router = useRouter();
	const [error, setError] = useState<string | null>(null);
	const [pending, setPending] = useState(false);

	async function onClick() {
		setPending(true);
		setError(null);
		try {
			const response = await fetch(
				`/api/admin/events/${eventSlug}/submissions/${submissionId}/reject`,
				{ method: "POST" },
			);
			const data = (await response.json()) as { ok?: boolean; error?: string };
			if (!response.ok || !data.ok) {
				setError(data.error ?? "Reject failed");
				return;
			}
			router.refresh();
		} catch {
			setError("Network error");
		} finally {
			setPending(false);
		}
	}

	return (
		<div className="space-y-1">
			<button
				type="button"
				onClick={() => void onClick()}
				disabled={disabled || pending}
				className="rounded border border-neutral-300 bg-white px-3 py-1 text-xs font-medium text-neutral-800 hover:bg-neutral-50 disabled:opacity-40"
			>
				{pending ? "Rejecting…" : "Reject"}
			</button>
			{error ? <p className="text-xs text-red-700">{error}</p> : null}
		</div>
	);
}
