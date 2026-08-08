"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { buttonClasses, INPUT_CLASSES, noticeClasses } from "@/components/ui";

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
			// Demo shortcut: API may return portalUrl for immediate entry.
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

	if (sent) {
		return (
			<div className="space-y-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-5">
				<p className="text-sm font-medium text-emerald-300">
					Check your email
				</p>
				<p className="text-pretty text-sm text-emerald-400">
					We sent a sign-in link to{" "}
					<span className="font-medium">{email}</span>. It expires soon — open it
					on this device to continue your checklist.
				</p>
				<button
					type="button"
					className="text-sm font-medium text-emerald-300 underline underline-offset-2"
					onClick={() => setSent(false)}
				>
					Use a different email
				</button>
			</div>
		);
	}

	return (
		<form
			onSubmit={onSubmit}
			className="space-y-4 rounded-lg border border-neutral-800 bg-neutral-900 px-4 py-5"
		>
			<label className="block space-y-1.5 text-sm">
				<span className="font-medium text-neutral-200">Email</span>
				<input
					type="email"
					required
					value={email}
					onChange={(e) => setEmail(e.target.value)}
					className={`w-full ${INPUT_CLASSES}`}
					placeholder="you@example.com"
					autoComplete="email"
				/>
			</label>
			{error ? <p className={noticeClasses("negative")}>{error}</p> : null}
			<button
				type="submit"
				disabled={pending}
				className={`w-full sm:w-auto ${buttonClasses("primary")}`}
			>
				{pending ? "Sending…" : "Email me a sign-in link"}
			</button>
		</form>
	);
}
