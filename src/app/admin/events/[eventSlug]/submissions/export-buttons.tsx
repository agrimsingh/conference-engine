"use client";

import { useState } from "react";

type Props = {
	eventSlug: string;
};

export function ExportButtons({ eventSlug }: Props) {
	const [error, setError] = useState<string | null>(null);
	const [message, setMessage] = useState<string | null>(null);
	const [pending, setPending] = useState(false);

	async function pushAirtable() {
		setPending(true);
		setError(null);
		setMessage(null);
		try {
			const response = await fetch(
				`/api/admin/events/${eventSlug}/export/airtable`,
				{ method: "POST" },
			);
			const data = (await response.json()) as {
				ok?: boolean;
				error?: string;
				created?: number;
				total?: number;
			};
			if (!response.ok || !data.ok) {
				setError(data.error ?? "Airtable push failed");
				return;
			}
			setMessage(`Pushed ${data.created ?? 0} of ${data.total ?? 0} rows to Airtable.`);
		} catch {
			setError("Network error");
		} finally {
			setPending(false);
		}
	}

	return (
		<div className="flex flex-wrap items-center gap-3 text-sm">
			<a
				href={`/api/admin/events/${eventSlug}/export/submissions.csv`}
				className="font-medium text-neutral-200 underline underline-offset-2"
			>
				Download CSV
			</a>
			<button
				type="button"
				onClick={() => void pushAirtable()}
				disabled={pending}
				className="font-medium text-neutral-200 underline underline-offset-2 disabled:opacity-40"
			>
				{pending ? "Pushing…" : "Push to Airtable"}
			</button>
			{message ? <p className="text-xs text-neutral-400">{message}</p> : null}
			{error ? <p className="text-xs text-red-400">{error}</p> : null}
		</div>
	);
}
