"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui";

type Props = {
	eventSlug: string;
};

export function CreateFormButton({ eventSlug }: Props) {
	const router = useRouter();
	const [open, setOpen] = useState(false);
	const [slug, setSlug] = useState("");
	const [title, setTitle] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);

	async function create() {
		setBusy(true);
		setError(null);
		const res = await fetch(`/api/admin/events/${eventSlug}/forms`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ slug, title }),
		});
		const json = (await res.json()) as {
			ok?: boolean;
			error?: string;
			form?: { slug: string };
		};
		setBusy(false);
		if (!res.ok || !json.ok || !json.form) {
			setError(json.error || "Create failed");
			return;
		}
		router.push(`/admin/events/${eventSlug}/forms/${json.form.slug}`);
		router.refresh();
	}

	if (!open) {
		return (
			<Button type="button" onClick={() => setOpen(true)}>
				New form
			</Button>
		);
	}

	return (
		<div className="mt-6 space-y-3 rounded-lg border border-neutral-800 bg-neutral-900 p-4">
			<h2 className="text-sm font-medium text-neutral-200">Create form</h2>
			<label className="block text-xs text-neutral-400">
				Slug
				<input
					className="mt-1 w-full rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-100"
					placeholder="workshops-2026"
					value={slug}
					onChange={(e) => setSlug(e.target.value)}
				/>
			</label>
			<label className="block text-xs text-neutral-400">
				Title
				<input
					className="mt-1 w-full rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-100"
					placeholder="Workshop CFP"
					value={title}
					onChange={(e) => setTitle(e.target.value)}
				/>
			</label>
			<div className="flex gap-2">
				<Button type="button" disabled={busy} onClick={() => void create()}>
					Create
				</Button>
				<button
					type="button"
					className="text-xs text-neutral-400"
					onClick={() => setOpen(false)}
				>
					Cancel
				</button>
			</div>
			{error ? (
				<p className="text-sm text-red-300" role="alert">
					{error}
				</p>
			) : null}
		</div>
	);
}
