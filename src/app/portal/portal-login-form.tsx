"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Props = {
	initialEmail: string;
};

export function PortalLoginForm({ initialEmail }: Props) {
	const router = useRouter();
	const [email, setEmail] = useState(initialEmail);
	const [error, setError] = useState<string | null>(null);
	const [sent, setSent] = useState(false);
	const [pending, setPending] = useState(false);

	async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setPending(true);
		setError(null);
		setSent(false);
		try {
			const response = await fetch("/api/portal/session", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ email }),
			});
			const data = (await response.json()) as {
				ok?: boolean;
				sent?: boolean;
				error?: string;
				portalUrl?: string;
			};
			if (!response.ok || !data.ok) {
				setError(data.error ?? "Could not send sign-in link");
				return;
			}
			// Admin bypass demo: API still returns portalUrl for one-click entry.
			if (data.portalUrl) {
				router.push(data.portalUrl);
				router.refresh();
				return;
			}
			setSent(true);
		} catch {
			setError("Network error");
		} finally {
			setPending(false);
		}
	}

	return (
		<form onSubmit={onSubmit} className="space-y-4">
			<label className="block space-y-1 text-sm">
				<span className="text-neutral-700">Email</span>
				<input
					type="email"
					required
					value={email}
					onChange={(e) => setEmail(e.target.value)}
					className="w-full rounded border border-neutral-300 px-3 py-2"
					placeholder="you@example.com"
				/>
			</label>
			{error ? <p className="text-sm text-red-700">{error}</p> : null}
			{sent ? (
				<p className="text-sm text-neutral-800">
					Check your email for a sign-in link.
				</p>
			) : null}
			<button
				type="submit"
				disabled={pending}
				className="rounded bg-neutral-900 px-4 py-2 text-sm text-white disabled:opacity-50"
			>
				{pending ? "Sending…" : "Email me a sign-in link"}
			</button>
		</form>
	);
}
