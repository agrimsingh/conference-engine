"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { buttonClasses } from "@/components/ui";

type Props = {
	eventSlug: string;
	submissionId: string;
	disabled?: boolean;
};

export function AcceptButton({ eventSlug, submissionId, disabled }: Props) {
	const router = useRouter();
	const [error, setError] = useState<string | null>(null);
	const [pending, setPending] = useState(false);

	async function onClick() {
		setPending(true);
		setError(null);
		try {
			const response = await fetch(
				`/api/admin/events/${eventSlug}/submissions/${submissionId}/accept`,
				{ method: "POST" },
			);
			const data = (await response.json()) as { ok?: boolean; error?: string };
			if (!response.ok || !data.ok) {
				setError(data.error ?? "Accept failed");
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
				className={`${buttonClasses("secondary", "sm")} text-emerald-400`}
			>
				{pending ? "Accepting…" : "Accept"}
			</button>
			{error ? <p className="text-xs text-red-400">{error}</p> : null}
		</div>
	);
}
