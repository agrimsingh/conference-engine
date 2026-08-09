"use client";

import { useEffect, useState } from "react";

type Props = {
	eventSlug: string;
};

export function ExportButtons({ eventSlug }: Props) {
	const [error, setError] = useState<string | null>(null);
	const [message, setMessage] = useState<string | null>(null);
	const [pending, setPending] = useState(false);
	const [syncEnabled, setSyncEnabled] = useState(false);
	const [syncConfigured, setSyncConfigured] = useState(false);
	const [syncPending, setSyncPending] = useState(false);

	useEffect(() => {
		void (async () => {
			try {
				const response = await fetch(
					`/api/admin/events/${eventSlug}/export/airtable/sync`,
				);
				const data = (await response.json()) as {
					ok?: boolean;
					enabled?: boolean;
					configured?: boolean;
				};
				if (response.ok && data.ok) {
					setSyncEnabled(Boolean(data.enabled));
					setSyncConfigured(Boolean(data.configured));
				}
			} catch {
				// ignore initial load errors
			}
		})();
	}, [eventSlug]);

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
				upserted?: number;
				total?: number;
			};
			if (!response.ok || !data.ok) {
				setError(data.error ?? "Airtable push failed");
				return;
			}
			setMessage(`Pushed ${data.upserted ?? 0} of ${data.total ?? 0} rows to Airtable.`);
		} catch {
			setError("Network error");
		} finally {
			setPending(false);
		}
	}

	async function toggleNightlySync(enabled: boolean) {
		setSyncPending(true);
		setError(null);
		setMessage(null);
		try {
			const response = await fetch(
				`/api/admin/events/${eventSlug}/export/airtable/sync`,
				{
					method: "PATCH",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({ enabled }),
				},
			);
			const data = (await response.json()) as { ok?: boolean; error?: string; enabled?: boolean };
			if (!response.ok || !data.ok) {
				setError(data.error ?? "Could not update nightly Airtable mirror sync");
				return;
			}
			setSyncEnabled(Boolean(data.enabled));
			setMessage(
				data.enabled
					? "Nightly Airtable mirror sync enabled for this event (one-way)."
					: "Nightly Airtable mirror sync disabled.",
			);
		} catch {
			setError("Network error");
		} finally {
			setSyncPending(false);
		}
	}

	return (
		<div className="space-y-3 text-sm">
			<div className="flex flex-wrap items-center gap-3">
				<a
					href={`/api/admin/events/${eventSlug}/export/submissions.csv`}
					className="font-medium text-neutral-200 underline underline-offset-2"
				>
					Download CSV
				</a>
				<a
					href={`/api/admin/events/${eventSlug}/export/submissions.xlsx`}
					className="font-medium text-neutral-200 underline underline-offset-2"
				>
					Export .XLSX
				</a>
				<a
					href={`/api/admin/events/${eventSlug}/export/submission-uploads.zip`}
					className="font-medium text-neutral-200 underline underline-offset-2"
				>
					Download files bundle
				</a>
				<button
					type="button"
					onClick={() => void pushAirtable()}
					disabled={pending}
					className="font-medium text-neutral-200 underline underline-offset-2 disabled:opacity-40"
				>
					{pending ? "Pushing…" : "Push to Airtable mirror"}
				</button>
			</div>
			<p className="text-xs text-neutral-500">
				Files bundle is CFP submission uploads. Latest speaker deliverables stay on the Files page.
				Airtable mirror is one-way (D1→Airtable); never reverse sync.
			</p>
			{syncConfigured ? (
				<label className="flex items-center gap-2 text-neutral-300">
					<input
						type="checkbox"
						checked={syncEnabled}
						disabled={syncPending}
						onChange={(event) => void toggleNightlySync(event.target.checked)}
					/>
					<span>Nightly Airtable mirror sync (one-way, 1:00 UTC)</span>
				</label>
			) : (
				<p className="text-xs text-neutral-500">
					Nightly Airtable mirror sync is unavailable until Airtable credentials are configured.
				</p>
			)}
			{message ? <p className="text-xs text-neutral-400">{message}</p> : null}
			{error ? <p className="text-xs text-red-400">{error}</p> : null}
		</div>
	);
}
