"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { buttonClasses, INPUT_CLASSES, noticeClasses } from "@/components/ui";

type CloneSource = { slug: string; name: string };

type Props = {
	canCreate: boolean;
	cloneSources?: CloneSource[];
};

export function CreateEventForm({ canCreate, cloneSources = [] }: Props) {
	const router = useRouter();
	const [name, setName] = useState("");
	const [slug, setSlug] = useState("");
	const [timezone, setTimezone] = useState("America/Los_Angeles");
	const [startDay, setStartDay] = useState("");
	const [endDay, setEndDay] = useState("");
	const [preset, setPreset] = useState<"minimal" | "conference">("minimal");
	const [cloneFrom, setCloneFrom] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [pending, setPending] = useState(false);
	const cloning = Boolean(cloneFrom);

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
			const endpoint = cloning
				? `/api/admin/events/${encodeURIComponent(cloneFrom)}/clone`
				: "/api/admin/events";
			const body = cloning
				? { name, slug, timezone, startDay, endDay }
				: { name, slug, timezone, startDay, endDay, preset };
			const response = await fetch(endpoint, {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify(body),
			});
			const data = (await response.json()) as {
				ok?: boolean;
				error?: string;
				slug?: string;
			};
			if (!response.ok || !data.ok || !data.slug) {
				setError(data.error ?? (cloning ? "Could not clone event" : "Could not create event"));
				return;
			}
			router.push(`/admin/events/${data.slug}/setup`);
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
			{cloneSources.length > 0 ? (
				<label className="block space-y-1.5 text-sm">
					<span className="font-medium text-neutral-200">Start from</span>
					<select
						value={cloneFrom}
						onChange={(e) => setCloneFrom(e.target.value)}
						className={`w-full ${INPUT_CLASSES}`}
					>
						<option value="">New event (CFP preset)</option>
						{cloneSources.map((source) => (
							<option key={source.slug} value={source.slug}>
								Clone {source.name} ({source.slug})
							</option>
						))}
					</select>
					<span className="block text-xs text-neutral-500">
						Clones forms, criteria, tasks, rooms, tracks, and message templates. Never submissions or people.
					</span>
				</label>
			) : null}
			<label className="block space-y-1.5 text-sm">
				<span className="font-medium text-neutral-200">Event name</span>
				<input
					type="text"
					required
					value={name}
					onChange={(e) => setName(e.target.value)}
					className={`w-full ${INPUT_CLASSES}`}
					placeholder="Summit 2026"
				/>
			</label>
			<div className="grid gap-4 sm:grid-cols-2">
				<label className="block space-y-1.5 text-sm"><span className="font-medium text-neutral-200">Start date</span><input type="date" required value={startDay} onChange={(e) => setStartDay(e.target.value)} className={`w-full ${INPUT_CLASSES}`} /></label>
				<label className="block space-y-1.5 text-sm"><span className="font-medium text-neutral-200">End date</span><input type="date" required min={startDay || undefined} value={endDay} onChange={(e) => setEndDay(e.target.value)} className={`w-full ${INPUT_CLASSES}`} /></label>
			</div>
			<label className="block space-y-1.5 text-sm">
				<span className="font-medium text-neutral-200">Slug</span>
				<input
					type="text"
					required
					value={slug}
					onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-"))}
					className={`w-full ${INPUT_CLASSES}`}
					placeholder="summit-2026"
					pattern="(?:[a-z0-9]|-)+"
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
			{!cloning ? (
				<label className="block space-y-1.5 text-sm">
					<span className="font-medium text-neutral-200">CFP preset</span>
					<select
						value={preset}
						onChange={(e) => setPreset(e.target.value === "conference" ? "conference" : "minimal")}
						className={`w-full ${INPUT_CLASSES}`}
					>
						<option value="minimal">Minimal (title, abstract, speakers)</option>
						<option value="conference">Conference (format-conditional fields)</option>
					</select>
				</label>
			) : null}
			{error ? <p className={noticeClasses("negative")}>{error}</p> : null}
			<button
				type="submit"
				disabled={pending}
				className={`w-full sm:w-auto ${buttonClasses("primary")}`}
			>
				{pending ? (cloning ? "Cloning…" : "Creating…") : cloning ? "Clone event" : "Create event"}
			</button>
		</form>
	);
}
