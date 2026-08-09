"use client";

import { useState } from "react";

type SessionShareActionsProps = {
	path: string;
	icsHref: string;
};

export function SessionShareActions({ path, icsHref }: SessionShareActionsProps) {
	const [message, setMessage] = useState<string | null>(null);

	async function copyLink() {
		const url =
			typeof window !== "undefined" ? new URL(path, window.location.origin).toString() : path;
		try {
			await navigator.clipboard.writeText(url);
			setMessage("Link copied.");
		} catch {
			setMessage("Copy the URL from the address bar.");
		}
	}

	async function share() {
		const url =
			typeof window !== "undefined" ? new URL(path, window.location.origin).toString() : path;
		if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
			try {
				await navigator.share({ url, title: document.title });
				setMessage("Shared.");
				return;
			} catch {
				// fall through to copy
			}
		}
		await copyLink();
	}

	return (
		<div className="flex flex-wrap items-center gap-2">
			<button
				type="button"
				onClick={copyLink}
				className="rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-200 hover:border-neutral-500"
			>
				Copy link
			</button>
			<button
				type="button"
				onClick={share}
				className="rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-200 hover:border-neutral-500"
			>
				Share
			</button>
			<a
				href={icsHref}
				className="rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-200 hover:border-neutral-500"
			>
				Add to calendar
			</a>
			{message ? <span className="text-xs text-neutral-500">{message}</span> : null}
		</div>
	);
}
