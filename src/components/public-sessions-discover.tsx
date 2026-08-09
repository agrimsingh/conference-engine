"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
	DiscoverFacetSelect,
	ScheduleQuerySelect,
} from "@/components/schedule-query-select";
import { ShowMoreText } from "@/components/show-more-text";
import { PublicSpeakerAvatar } from "@/components/public-speaker-avatar";
import { EmptyState } from "@/components/ui";
import {
	discoverFacetValues,
	filterPublicDiscoverSessions,
	type PublicDiscoverSession,
} from "@/lib/schedule/public-discover";
import { formatClock } from "@/lib/schedule/time";
import { speakerRoleLine } from "@/lib/speakers/public-directory";

export type DiscoverListSession = PublicDiscoverSession & {
	detailHref: string;
	endsAtMs: number;
	speakers: Array<{
		personId: string | null;
		name: string;
		jobTitle: string | null;
		company: string | null;
		hasHeadshot: boolean;
	}>;
};

export function PublicSessionsDiscover({
	sessions,
	timezone,
	eventSlug,
	basePath,
	initialDayKey,
	initialRoom = "all",
	roomOptions,
}: {
	sessions: DiscoverListSession[];
	timezone: string;
	eventSlug: string;
	basePath: "/e" | "/embed";
	/** Concrete day key, or `"all"` when Event days → All days is selected. */
	initialDayKey: string;
	initialRoom?: string;
	roomOptions?: Array<{ value: string; label: string; href: string }>;
}) {
	const [q, setQ] = useState("");
	const [track, setTrack] = useState("all");
	const [format, setFormat] = useState("all");

	const tracks = useMemo(() => discoverFacetValues(sessions, "trackName"), [sessions]);
	const formats = useMemo(() => discoverFacetValues(sessions, "format"), [sessions]);

	const scoped = useMemo(() => {
		const base =
			initialDayKey === "all"
				? sessions
				: sessions.filter((session) => session.dayKey === initialDayKey);
		return filterPublicDiscoverSessions(base, {
			q,
			track,
			format,
			location: initialRoom,
		});
	}, [sessions, initialDayKey, q, track, format, initialRoom]);

	const showTrackFacet = tracks.length > 1;
	const showFormatFacet = formats.length > 1;

	return (
		<div className="space-y-5">
			<div className="space-y-3 rounded-lg border border-neutral-800 bg-neutral-950/40 p-3">
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
				<div className="flex flex-wrap items-end gap-x-4 gap-y-3">
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

			{scoped.length === 0 ? (
				<EmptyState
					title="No matching sessions"
					description="Try clearing search or widening filters."
				/>
			) : (
				<ol className="space-y-4">
					{scoped.map((session) => {
						const full = sessions.find((item) => item.id === session.id)!;
						return (
							<li key={session.id} className="border-l-2 border-neutral-200 pl-4">
								<p className="font-mono text-xs tabular-nums text-neutral-500">
									{formatClock(session.startsAtMs, timezone)}–
									{formatClock(full.endsAtMs, timezone)} · {session.location} ·{" "}
									{session.trackName}
									{session.format ? ` · ${session.format}` : ""}
								</p>
								<h2 className="mt-1 text-lg font-medium tracking-tight text-neutral-100">
									<Link className="hover:underline" href={full.detailHref}>
										{session.title}
									</Link>
								</h2>
								{full.speakers.length > 0 ? (
									<ul className="mt-1 flex flex-wrap gap-3">
										{full.speakers.map((speaker, index) => {
											const role = speakerRoleLine(speaker);
											return (
												<li key={`${speaker.personId ?? speaker.name}-${index}`}>
													<PublicSpeakerAvatar
														eventSlug={eventSlug}
														personId={speaker.personId}
														name={speaker.name}
														hasHeadshot={speaker.hasHeadshot}
														size="sm"
														profileHref={
															basePath === "/e" && speaker.personId
																? `/e/${eventSlug}/speakers/${speaker.personId}`
																: null
														}
													/>
													{role ? (
														<p className="mt-0.5 text-xs text-neutral-500">{role}</p>
													) : null}
												</li>
											);
										})}
									</ul>
								) : null}
								{session.abstract ? (
									<div className="mt-2 max-w-2xl">
										<ShowMoreText text={session.abstract} maxChars={160} />
									</div>
								) : null}
							</li>
						);
					})}
				</ol>
			)}
		</div>
	);
}
