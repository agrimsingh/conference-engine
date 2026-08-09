"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { PublicSpeakerAvatar } from "@/components/public-speaker-avatar";
import { ShowMoreText } from "@/components/show-more-text";
import { SEGMENTED_CONTAINER_CLASSES } from "@/components/ui";
import {
	filterSpeakersByQuery,
	speakerAffiliation,
	type PublicDirectorySpeaker,
} from "@/lib/speakers/public-directory";

export type SpeakersDirectoryView = "list" | "gallery";

export function PublicSpeakersDirectory({
	eventSlug,
	speakers,
	initialView = "list",
}: {
	eventSlug: string;
	speakers: PublicDirectorySpeaker[];
	initialView?: SpeakersDirectoryView;
}) {
	const [q, setQ] = useState("");
	const view = initialView;
	const filtered = useMemo(() => filterSpeakersByQuery(speakers, q), [speakers, q]);
	const listHref = `/e/${eventSlug}/speakers`;
	const galleryHref = `/e/${eventSlug}/speakers?view=gallery`;

	return (
		<div className="space-y-6">
			<div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
				<label className="block min-w-0 flex-1 text-xs font-medium uppercase tracking-wide text-neutral-500">
					Search speakers
					<input
						type="search"
						value={q}
						onChange={(event) => setQ(event.target.value)}
						placeholder="Name, title, or company"
						className="mt-1.5 w-full rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-500"
					/>
				</label>
				<div
					role="tablist"
					aria-label="Speaker layout"
					className={SEGMENTED_CONTAINER_CLASSES}
				>
					{(
						[
							{ mode: "list" as const, href: listHref, label: "List" },
							{ mode: "gallery" as const, href: galleryHref, label: "Gallery" },
						] as const
					).map(({ mode, href, label }) => {
						const active = view === mode;
						return (
							<Link
								key={mode}
								role="tab"
								aria-selected={active}
								href={href}
								className={
									active
										? "rounded-md bg-neutral-800 px-3 py-1.5 text-sm font-medium text-neutral-100"
										: "rounded-md px-3 py-1.5 text-sm font-medium text-neutral-400 hover:text-neutral-100"
								}
							>
								{label}
							</Link>
						);
					})}
				</div>
			</div>

			{filtered.length === 0 ? (
				<p className="text-sm text-neutral-500">No speakers match that search.</p>
			) : view === "gallery" ? (
				<ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
					{filtered.map((speaker) => {
						const affiliation = speakerAffiliation(speaker);
						const href = `/e/${eventSlug}/speakers/${speaker.personId}`;
						return (
							<li key={speaker.personId}>
								<Link
									href={href}
									className="flex flex-col items-center gap-2 rounded-lg border border-neutral-800 bg-neutral-900/50 px-3 py-4 text-center hover:border-neutral-600"
								>
									<PublicSpeakerAvatar
										eventSlug={eventSlug}
										personId={speaker.personId}
										name={speaker.displayName}
										hasHeadshot={speaker.hasHeadshot}
										size="lg"
										showName={false}
									/>
									<span className="text-sm font-medium text-neutral-100">
										{speaker.displayName}
									</span>
									{affiliation ? (
										<span className="text-xs leading-5 text-neutral-500">
											{affiliation}
										</span>
									) : null}
								</Link>
							</li>
						);
					})}
				</ul>
			) : (
				<ul className="divide-y divide-neutral-800">
					{filtered.map((speaker) => {
						const affiliation = speakerAffiliation(speaker);
						return (
							<li key={speaker.personId} className="py-4">
								<PublicSpeakerAvatar
									eventSlug={eventSlug}
									personId={speaker.personId}
									name={speaker.displayName}
									hasHeadshot={speaker.hasHeadshot}
									profileHref={`/e/${eventSlug}/speakers/${speaker.personId}`}
								/>
								{affiliation ? (
									<p className="mt-1 text-sm text-neutral-500">{affiliation}</p>
								) : null}
								{speaker.bio ? (
									<div className="mt-2 max-w-2xl">
										<ShowMoreText text={speaker.bio} maxChars={200} />
									</div>
								) : null}
							</li>
						);
					})}
				</ul>
			)}
		</div>
	);
}
