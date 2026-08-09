export type PublicDirectorySpeaker = {
	personId: string;
	displayName: string;
	bio: string | null;
	hasHeadshot: boolean;
	jobTitle?: string | null;
	company?: string | null;
};

/** Last whitespace-separated token; single-token names sort as themselves. */
export function speakerSurname(displayName: string): string {
	const parts = displayName.trim().split(/\s+/).filter(Boolean);
	if (parts.length === 0) return "";
	return parts[parts.length - 1]!.toLowerCase();
}

export function compareSpeakersBySurname(
	a: Pick<PublicDirectorySpeaker, "displayName">,
	b: Pick<PublicDirectorySpeaker, "displayName">,
): number {
	const surnameCmp = speakerSurname(a.displayName).localeCompare(
		speakerSurname(b.displayName),
		undefined,
		{ sensitivity: "base" },
	);
	if (surnameCmp !== 0) return surnameCmp;
	return a.displayName.localeCompare(b.displayName, undefined, { sensitivity: "base" });
}

export function sortSpeakersBySurname<T extends Pick<PublicDirectorySpeaker, "displayName">>(
	speakers: readonly T[],
): T[] {
	return [...speakers].sort(compareSpeakersBySurname);
}

export function speakerMatchesQuery(
	speaker: Pick<PublicDirectorySpeaker, "displayName" | "jobTitle" | "company">,
	q: string | undefined,
): boolean {
	const needle = q?.trim().toLowerCase() ?? "";
	if (!needle) return true;
	const haystack = [speaker.displayName, speaker.jobTitle ?? "", speaker.company ?? ""]
		.join("\0")
		.toLowerCase();
	return haystack.includes(needle);
}

export function filterSpeakersByQuery<
	T extends Pick<PublicDirectorySpeaker, "displayName" | "jobTitle" | "company">,
>(speakers: readonly T[], q: string | undefined): T[] {
	return speakers.filter((speaker) => speakerMatchesQuery(speaker, q));
}

export function speakerAffiliation(
	speaker: Pick<PublicDirectorySpeaker, "jobTitle" | "company">,
): string | null {
	const title = speaker.jobTitle?.trim() || "";
	const company = speaker.company?.trim() || "";
	if (title && company) return `${title}, ${company}`;
	if (title) return title;
	if (company) return company;
	return null;
}
