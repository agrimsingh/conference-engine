"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { buttonClasses } from "@/components/ui";

type Props = {
	eventSlug: string;
	eventName: string;
};

export function ClaimOrphanButton({ eventSlug, eventName }: Props) {
	const router = useRouter();
	const [error, setError] = useState<string | null>(null);
	const [pending, setPending] = useState(false);

	async function claim() {
		setPending(true);
		setError(null);
		try {
			const response = await fetch(`/api/admin/events/${eventSlug}/claim`, {
				method: "POST",
			});
			const data = (await response.json()) as {
				ok?: boolean;
				error?: string;
			};
			if (!response.ok || !data.ok) {
				setError(data.error || "Claim failed");
				setPending(false);
				return;
			}
			router.push(`/admin/events/${eventSlug}/submissions`);
			router.refresh();
		} catch {
			setError("Claim failed");
			setPending(false);
		}
	}

	return (
		<div className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
			<div>
				<p className="text-sm font-medium text-neutral-100">{eventName}</p>
				<p className="text-xs text-neutral-500">{eventSlug} · no owner</p>
				{error ? <p className="mt-1 text-xs text-red-400">{error}</p> : null}
			</div>
			<button
				type="button"
				disabled={pending}
				onClick={() => void claim()}
				className={buttonClasses("secondary")}
			>
				{pending ? "Claiming…" : "Claim as owner"}
			</button>
		</div>
	);
}
