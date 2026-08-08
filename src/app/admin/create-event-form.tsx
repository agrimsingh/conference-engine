"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { buttonClasses, INPUT_CLASSES, noticeClasses } from "@/components/ui";

type Props = {
	canCreate: boolean;
};

export function CreateEventForm({ canCreate }: Props) {
	const router = useRouter();
	const [name, setName] = useState("");
	const [slug, setSlug] = useState("");
	const [timezone, setTimezone] = useState("America/Los_Angeles");
	const [error, setError] = useState<string | null>(null);
	const [pending, setPending] = useState(false);

	if (!canCreate) {
		return (
			<p className="rounded-lg border border-neutral-800 bg-neutral-900 px-4 py-5 text-sm text-neutral-400">
				Sign in with a magic link to create events with owner access, or enable the
				local bypass cookie.
			</p>
		);
	}

	async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setPending(true);
		setError(null);
		try {
			const response = await fetch("/api/admin/events", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ name, slug, timezone }),
			});
			const data = (await response.json()) as {
				ok?: boolean;
				error?: string;
				slug?: string;
			};
			if (!response.ok || !data.ok || !data.slug) {
				setError(data.error ?? "Could not create event");
				return;
			}
			router.push(`/admin/events/${data.slug}/submissions`);
			router.refresh();
		} catch {
			setError("Network error");
		} finally {
			setPending(false);
		}
	}

	return (
		<form
			onSubmit={onSubmit}
			className="space-y-4 rounded-lg border border-neutral-800 bg-neutral-900 px-4 py-5"
		>
			<label className="block space-y-1.5 text-sm">
				<span className="font-medium text-neutral-200">Event name</span>
				<input
					type="text"
					required
					value={name}
					onChange={(e) => setName(e.target.value)}
					className={`w-full ${INPUT_CLASSES}`}
					placeholder="AI Engineer 2026"
				/>
			</label>
			<label className="block space-y-1.5 text-sm">
				<span className="font-medium text-neutral-200">Slug</span>
				<input
					type="text"
					required
					value={slug}
					onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-"))}
					className={`w-full ${INPUT_CLASSES}`}
					placeholder="aie-2026"
					pattern="[a-z0-9-]+"
				/>
			</label>
			<label className="block space-y-1.5 text-sm">
				<span className="font-medium text-neutral-200">Timezone</span>
				<input
					type="text"
					value={timezone}
					onChange={(e) => setTimezone(e.target.value)}
					className={`w-full ${INPUT_CLASSES}`}
				/>
			</label>
			{error ? <p className={noticeClasses("negative")}>{error}</p> : null}
			<button
				type="submit"
				disabled={pending}
				className={`w-full sm:w-auto ${buttonClasses("primary")}`}
			>
				{pending ? "Creating…" : "Create event"}
			</button>
		</form>
	);
}
