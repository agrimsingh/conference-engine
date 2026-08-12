"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { PublicSpeakerLine } from "@/components/public-speaker-line";
import {
	DiscoverFacetSelect,
	ScheduleQuerySelect,
} from "@/components/schedule-query-select";
import { ShowMoreText } from "@/components/show-more-text";
import { EmptyState } from "@/components/ui";
import {
	discoverFacetValues,
	filterPublicDiscoverSessions,
	type PublicDiscoverSession,
} from "@/lib/schedule/public-discover";
import {
	itineraryStorageKey,
	parseItinerarySelection,
	serializeItinerarySelection,
	setSessionSelected,
} from "@/lib/schedule/itinerary";

export type PublicItinerarySession = {
	id: string;
	sessionId: string;
	title: string;
	abstract: string;
	format: string;
	roomName: string;
	trackId: string | null;
	trackName: string;
	startsAtMs: number;
	endsAtMs: number;
	dayKey: string;
	detailHref: string;
	speakers: Array<{
		personId: string | null;
		name: string;
		jobTitle: string | null;
		company: string | null;
		hasHeadshot: boolean;
	}>;
};

function formatClock(ms: number, timeZone: string): string {
	return new Intl.DateTimeFormat("en", { timeZone, hour: "numeric", minute: "2-digit" }).format(new Date(ms));
}

function formatDay(dayKey: string, timeZone: string): string {
	return new Intl.DateTimeFormat("en", { timeZone, weekday: "long", month: "long", day: "numeric" }).format(new Date(`${dayKey}T12:00:00Z`));
}

function toDiscoverSession(session: PublicItinerarySession): PublicDiscoverSession {
	return {
		id: session.id,
		title: session.title,
		abstract: session.abstract,
		trackId: session.trackId,
		trackName: session.trackName,
		format: session.format,
		location: session.roomName,
		speakerNames: session.speakers.map((speaker) => speaker.name),
		startsAtMs: session.startsAtMs,
		dayKey: session.dayKey,
	};
}

export function PublicItinerary({
	eventSlug,
	timezone,
	sessions,
	eventSessionIds,
	mode,
	initialDayKey = "all",
	initialRoom = "all",
	roomOptions,
	selectionEnabled = true,
	basePath = "/e",
}: {
	eventSlug: string;
	timezone: string;
	sessions: PublicItinerarySession[];
	eventSessionIds: readonly string[];
	mode: "itinerary" | "my-schedule";
	initialDayKey?: string;
	initialRoom?: string;
	roomOptions?: Array<{ value: string; label: string; href: string }>;
	selectionEnabled?: boolean;
	basePath?: "/e" | "/embed";
}) {
	const [selectedIds, setSelectedIds] = useState<string[]>([]);
	const [hydrated, setHydrated] = useState(!selectionEnabled);
	const [exportError, setExportError] = useState("");
	const [exporting, setExporting] = useState(false);
	const [q, setQ] = useState("");
	const [track, setTrack] = useState("all");
	const [format, setFormat] = useState("all");

	useEffect(() => {
		if (!selectionEnabled) return;
		const timer = window.setTimeout(() => {
			setSelectedIds(parseItinerarySelection(window.localStorage.getItem(itineraryStorageKey(eventSlug)), eventSlug, eventSessionIds));
			setHydrated(true);
		}, 0);
		return () => window.clearTimeout(timer);
	}, [eventSessionIds, eventSlug, selectionEnabled]);

	useEffect(() => {
		if (!selectionEnabled || !hydrated) return;
		window.localStorage.setItem(itineraryStorageKey(eventSlug), serializeItinerarySelection(eventSlug, selectedIds));
	}, [eventSlug, hydrated, selectedIds, selectionEnabled]);

	const selected = useMemo(() => new Set(selectedIds), [selectedIds]);
	const modeScoped = useMemo(
		() =>
			mode === "my-schedule"
				? sessions.filter((session) => selected.has(session.sessionId))
				: sessions,
		[mode, selected, sessions],
	);

	const dayScoped = useMemo(() => {
		if (initialDayKey === "all") return modeScoped;
		return modeScoped.filter((session) => session.dayKey === initialDayKey);
	}, [initialDayKey, modeScoped]);

	const discoverSessions = useMemo(() => dayScoped.map(toDiscoverSession), [dayScoped]);
	const tracks = useMemo(() => discoverFacetValues(discoverSessions, "trackName"), [discoverSessions]);
	const formats = useMemo(() => discoverFacetValues(discoverSessions, "format"), [discoverSessions]);

	const filteredIds = useMemo(() => {
		if (mode !== "itinerary") {
			return new Set(dayScoped.map((session) => session.id));
		}
		return new Set(
			filterPublicDiscoverSessions(discoverSessions, {
				q,
				track,
				format,
				location: initialRoom,
			}).map((session) => session.id),
		);
	}, [dayScoped, discoverSessions, format, initialRoom, mode, q, track]);

	const visible = [...dayScoped]
		.filter((session) => filteredIds.has(session.id))
		.sort((a, b) => a.startsAtMs - b.startsAtMs || a.title.localeCompare(b.title));
	const dayKeys = [...new Set(visible.map((session) => session.dayKey))];
	const showTrackFacet = tracks.length > 1;
	const showFormatFacet = formats.length > 1;

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
					<p className="mt-1 text-sm text-neutral-400">
						{mode === "itinerary"
							? selectionEnabled
								? "Browse sessions, add what you want, then open My Schedule anytime."
								: "Browse the published program."
							: `${selectedIds.length} selected ${selectedIds.length === 1 ? "session" : "sessions"}.`}
					</p>
				</div>
				{mode === "my-schedule" && selectionEnabled ? (
					<button type="button" onClick={exportCalendar} disabled={selectedIds.length === 0 || exporting} className="rounded-md bg-neutral-100 px-3 py-2 text-sm font-medium text-neutral-950 hover:bg-white disabled:cursor-not-allowed disabled:opacity-40">
						{exporting ? "Preparing calendar…" : "Export selected sessions"}
					</button>
				) : null}
			</div>

			{mode === "itinerary" ? (
				<div className="mb-6 space-y-3 rounded-lg border border-neutral-800 bg-neutral-950/40 p-3">
					<label className="block text-xs font-medium uppercase tracking-wide text-neutral-500">
						Search sessions
						<input
							type="search"
							value={q}
							onChange={(event) => setQ(event.target.value)}
							placeholder="Title or speaker"
							className="mt-1.5 w-full rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-500"
						/>
					</label>
					<div className="grid grid-cols-1 gap-3 sm:flex sm:flex-wrap sm:items-end sm:gap-x-4">
						{roomOptions && roomOptions.length > 1 ? (
							<ScheduleQuerySelect
								label="Room"
								value={initialRoom}
								options={roomOptions}
							/>
						) : null}
						{showTrackFacet ? (
							<DiscoverFacetSelect
								label="Track"
								value={track}
								options={tracks}
								onChange={setTrack}
								allLabel="All tracks"
							/>
						) : null}
						{showFormatFacet ? (
							<DiscoverFacetSelect
								label="Format"
								value={format}
								options={formats}
								onChange={setFormat}
								allLabel="All formats"
							/>
						) : null}
					</div>
				</div>
			) : null}

			{exportError ? <p role="alert" className="mb-4 text-sm text-red-300">{exportError}</p> : null}
			{visible.length === 0 ? (
				mode === "my-schedule" ? (
					<div className="rounded-lg border border-dashed border-neutral-700 bg-neutral-900/50 px-5 py-10 text-center">
						<h3 className="font-medium text-neutral-100">Your schedule is empty</h3>
						<p className="mt-1 text-sm text-neutral-400">Add sessions from the Itinerary to build your day.</p>
						{selectionEnabled ? (
							<Link className="mt-4 inline-block text-sm font-medium text-neutral-100 underline underline-offset-4" href={`/e/${eventSlug}/schedule?view=itinerary`}>Browse the Itinerary</Link>
						) : null}
					</div>
				) : (
					<EmptyState
						title="No matching sessions"
						description="Try clearing search or widening filters."
					/>
				)
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
													<PublicSpeakerLine
														speakers={session.speakers}
														eventSlug={eventSlug}
														profileHrefFor={(personId) =>
															basePath === "/e" ? `/e/${eventSlug}/speakers/${personId}` : null
														}
													/>
													<dl className="mt-3 grid gap-x-4 gap-y-1 text-xs text-neutral-400 sm:grid-cols-3">
														<div><dt className="inline font-medium text-neutral-500">Format: </dt><dd className="inline">{session.format}</dd></div>
														<div><dt className="inline font-medium text-neutral-500">Track: </dt><dd className="inline">{session.trackName}</dd></div>
														<div><dt className="inline font-medium text-neutral-500">Room: </dt><dd className="inline">{session.roomName}</dd></div>
													</dl>
													{session.abstract ? <div className="mt-3"><ShowMoreText text={session.abstract} /></div> : null}
												</div>
												{selectionEnabled ? (
													<button type="button" aria-pressed={isSelected} aria-label={label} onClick={() => toggle(session.sessionId, !isSelected)} className="shrink-0 rounded-md border border-neutral-700 px-3 py-1.5 text-sm font-medium text-neutral-200 hover:border-neutral-500 hover:bg-neutral-800">{isSelected ? "Remove" : "+ Add"}</button>
												) : null}
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
