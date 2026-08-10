"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { PageHeader } from "@/components/page-header";
import { buttonClasses, INPUT_CLASSES, noticeClasses } from "@/components/ui";

type Props = {
	initialEmail: string;
	next: string;
	initialError: string | null;
};

export function OrganizerLoginForm({ initialEmail, next, initialError }: Props) {
	const router = useRouter();
	const [email, setEmail] = useState(initialEmail);
	const [name, setName] = useState("");
	const [showName, setShowName] = useState(false);
	const [error, setError] = useState<string | null>(initialError);
	const [sent, setSent] = useState(false);
	const [pending, setPending] = useState(false);

	async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setPending(true);
		setError(null);
		setSent(false);
		try {
			const response = await fetch("/api/auth/request-link", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({
					email,
					...(name.trim() ? { name: name.trim() } : {}),
					next,
				}),
			});
			const data = (await response.json()) as {
				ok?: boolean;
				error?: string;
				loginUrl?: string;
			};
			if (!response.ok || !data.ok) {
				setError(data.error ?? "Could not send sign-in link");
				return;
			}
			if (data.loginUrl) {
				router.push(data.loginUrl);
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
			<>
				<PageHeader
					eyebrow="Organizer workspace"
					title="Check your email to continue"
					description="We sent a secure, one-time link. Open it on this device to create or manage your event."
				/>
				<div className="space-y-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-5">
					<p className="text-sm font-medium text-emerald-300">
						Link sent to {email}
					</p>
					<button
						type="button"
						className="text-sm font-medium text-emerald-300 underline underline-offset-2"
						onClick={() => setSent(false)}
					>
						Use a different email
					</button>
				</div>
			</>
		);
	}

	return (
		<>
			<PageHeader
				eyebrow="Organizer workspace"
				title="Create or open your event"
				description="Enter your email for a secure sign-in link. New organizers can create their first event as soon as they sign in."
			/>
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
				{showName ? (
					<label className="block space-y-1.5 text-sm">
						<span className="font-medium text-neutral-200">Name (optional)</span>
						<input
							type="text"
							value={name}
							onChange={(e) => setName(e.target.value)}
							className={`w-full ${INPUT_CLASSES}`}
							placeholder="Your name"
							autoComplete="name"
						/>
					</label>
				) : (
					<button
						type="button"
						className="text-sm text-neutral-400 underline underline-offset-2 hover:text-neutral-200"
						onClick={() => setShowName(true)}
					>
						New here? Add your name
					</button>
				)}
				{error ? <p className={noticeClasses("negative")}>{error}</p> : null}
				<p className="text-sm text-neutral-400">
					After sign-in, guided setup walks you through dates, CFP, review,
					speakers, and schedule publishing.
				</p>
				<button
					type="submit"
					disabled={pending}
					className={`w-full ${buttonClasses("primary")}`}
				>
					{pending ? "Sending…" : "Continue with email"}
				</button>
			</form>
			<aside className="mt-6 rounded-lg border border-neutral-800 bg-neutral-950/60 px-4 py-4 text-sm text-neutral-400">
				<p className="font-medium text-neutral-200">Evaluating without inbox access?</p>
				<p className="mt-1.5 leading-relaxed">
					Organizers sign in with a one-time email link. Once inside an event, you can mint
					speaker portal sign-in links from Speakers and personal reviewer links from Review —
					copy them into another browser window without waiting on email.
				</p>
			</aside>
			<p className="mt-8 text-sm text-neutral-500">
				<Link
					className="underline underline-offset-2 hover:text-neutral-300"
					href="/"
				>
					← Home
				</Link>
			</p>
		</>
	);
}
