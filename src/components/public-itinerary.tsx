"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { itineraryStorageKey, parseItinerarySelection, serializeItinerarySelection, setSessionSelected } from "@/lib/schedule/itinerary";
import { ShowMoreText } from "@/components/show-more-text";

export type PublicItinerarySession = {
	id: string;
	sessionId: string;
	title: string;
	abstract: string;
	format: string;
	roomName: string;
	trackName: string;
	startsAtMs: number;
	endsAtMs: number;
	dayKey: string;
	detailHref: string;
	speakers: Array<{ name: string; jobTitle: string | null; company: string | null }>;
};

function formatClock(ms: number, timeZone: string): string {
	return new Intl.DateTimeFormat("en", { timeZone, hour: "numeric", minute: "2-digit" }).format(new Date(ms));
}

function formatDay(dayKey: string, timeZone: string): string {
	return new Intl.DateTimeFormat("en", { timeZone, weekday: "long", month: "long", day: "numeric" }).format(new Date(`${dayKey}T12:00:00Z`));
}

export function PublicItinerary({ eventSlug, timezone, sessions, mode }: {
	eventSlug: string;
	timezone: string;
	sessions: PublicItinerarySession[];
	mode: "itinerary" | "my-schedule";
}) {
	const [selectedIds, setSelectedIds] = useState<string[]>([]);
	const [hydrated, setHydrated] = useState(false);
	const [exportError, setExportError] = useState("");
	const [exporting, setExporting] = useState(false);
	const availableIds = useMemo(() => sessions.map((session) => session.sessionId), [sessions]);

	useEffect(() => {
		const timer = window.setTimeout(() => {
			setSelectedIds(parseItinerarySelection(window.localStorage.getItem(itineraryStorageKey(eventSlug)), eventSlug, availableIds));
			setHydrated(true);
		}, 0);
		return () => window.clearTimeout(timer);
	}, [availableIds, eventSlug]);

	useEffect(() => {
		if (!hydrated) return;
		window.localStorage.setItem(itineraryStorageKey(eventSlug), serializeItinerarySelection(eventSlug, selectedIds));
	}, [eventSlug, hydrated, selectedIds]);

	const selected = useMemo(() => new Set(selectedIds), [selectedIds]);
	const visible = [...(mode === "my-schedule" ? sessions.filter((session) => selected.has(session.sessionId)) : sessions)]
		.sort((a, b) => a.startsAtMs - b.startsAtMs || a.title.localeCompare(b.title));
	const dayKeys = [...new Set(visible.map((session) => session.dayKey))];

	function toggle(sessionId: string, shouldSelect: boolean) {
		setSelectedIds((current) => setSessionSelected(current, sessionId, shouldSelect));
		setExportError("");
	}

	async function exportCalendar() {
		if (selectedIds.length === 0 || exporting) return;
		setExporting(true);
		setExportError("");
		try {
			const response = await fetch(`/api/e/${encodeURIComponent(eventSlug)}/itinerary/ics`, {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ sessionIds: selectedIds }),
			});
			if (!response.ok) throw new Error("Your saved schedule is stale. Remove the unavailable session and try again.");
			const url = URL.createObjectURL(await response.blob());
			const anchor = document.createElement("a");
			anchor.href = url;
			anchor.download = `${eventSlug}-my-schedule.ics`;
			anchor.click();
			URL.revokeObjectURL(url);
		} catch (error) {
			setExportError(error instanceof Error ? error.message : "Calendar export failed. Try again.");
		} finally {
			setExporting(false);
		}
	}

	return (
		<section aria-labelledby={`${mode}-heading`}>
			<div className="mb-6 flex flex-wrap items-end justify-between gap-3">
				<div>
					<h2 id={`${mode}-heading`} className="text-2xl font-semibold tracking-tight text-neutral-100">{mode === "itinerary" ? "Itinerary" : "My Schedule"}</h2>
					<p className="mt-1 text-sm text-neutral-400">{mode === "itinerary" ? "Build your event plan, then find it anytime in My Schedule." : `${selectedIds.length} selected ${selectedIds.length === 1 ? "session" : "sessions"}.`}</p>
				</div>
				{mode === "my-schedule" ? (
					<button type="button" onClick={exportCalendar} disabled={selectedIds.length === 0 || exporting} className="rounded-md bg-neutral-100 px-3 py-2 text-sm font-medium text-neutral-950 hover:bg-white disabled:cursor-not-allowed disabled:opacity-40">
						{exporting ? "Preparing calendar…" : "Export selected sessions"}
					</button>
				) : null}
			</div>

			{exportError ? <p role="alert" className="mb-4 text-sm text-red-300">{exportError}</p> : null}
			{visible.length === 0 ? (
				<div className="rounded-lg border border-dashed border-neutral-700 bg-neutral-900/50 px-5 py-10 text-center">
					<h3 className="font-medium text-neutral-100">Your schedule is empty</h3>
					<p className="mt-1 text-sm text-neutral-400">Add sessions from the Itinerary to build your day.</p>
					<Link className="mt-4 inline-block text-sm font-medium text-neutral-100 underline underline-offset-4" href={`/e/${eventSlug}/schedule?view=itinerary`}>Browse the Itinerary</Link>
				</div>
			) : (
				<div className="space-y-8">
					{dayKeys.map((dayKey) => (
						<section key={dayKey} id={`day-${dayKey}`} aria-labelledby={`day-${dayKey}-heading`} className="scroll-mt-6">
							<h3 id={`day-${dayKey}-heading`} className="mb-3 text-sm font-medium uppercase tracking-wide text-neutral-400">{formatDay(dayKey, timezone)}</h3>
							<ul className="space-y-3">
								{visible.filter((session) => session.dayKey === dayKey).map((session) => {
									const isSelected = selected.has(session.sessionId);
									const label = `${isSelected ? "Remove" : "Add"} ${session.title} ${isSelected ? "from" : "to"} My Schedule`;
									return (
										<li key={session.id} className="rounded-lg border border-neutral-800 bg-neutral-900 p-4">
											<div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
												<div>
													<p className="font-mono text-xs tabular-nums text-neutral-400">{formatDay(session.dayKey, timezone)} · {formatClock(session.startsAtMs, timezone)}–{formatClock(session.endsAtMs, timezone)}</p>
													<Link className="mt-1 block font-medium text-neutral-100 hover:underline" href={session.detailHref}>{session.title}</Link>
													{session.speakers.length > 0 ? (
														<ul className="mt-1 text-sm text-neutral-400">
															{session.speakers.map((speaker, index) => {
																const role = [speaker.jobTitle, speaker.company].filter(Boolean).join(" at ");
																return <li key={`${speaker.name}-${index}`}>{speaker.name}{role ? ` · ${role}` : ""}</li>;
															})}
														</ul>
													) : null}
													<dl className="mt-3 grid gap-x-4 gap-y-1 text-xs text-neutral-400 sm:grid-cols-3">
														<div><dt className="inline font-medium text-neutral-500">Format: </dt><dd className="inline">{session.format}</dd></div>
														<div><dt className="inline font-medium text-neutral-500">Track: </dt><dd className="inline">{session.trackName}</dd></div>
														<div><dt className="inline font-medium text-neutral-500">Room: </dt><dd className="inline">{session.roomName}</dd></div>
													</dl>
													{session.abstract ? <div className="mt-3"><ShowMoreText text={session.abstract} /></div> : null}
												</div>
												<button type="button" aria-pressed={isSelected} aria-label={label} onClick={() => toggle(session.sessionId, !isSelected)} className="shrink-0 rounded-md border border-neutral-700 px-3 py-1.5 text-sm font-medium text-neutral-200 hover:border-neutral-500 hover:bg-neutral-800">{isSelected ? "Remove" : "+ Add"}</button>
											</div>
										</li>
									);
								})}
							</ul>
						</section>
					))}
				</div>
			)}
		</section>
	);
}
