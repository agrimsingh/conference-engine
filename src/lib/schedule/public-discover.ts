export type PublicDiscoverSession = {
	id: string;
	title: string;
	abstract: string;
	trackId: string | null;
	trackName: string;
	format: string;
	location: string;
	speakerNames: readonly string[];
	startsAtMs: number;
	dayKey: string;
};

export type PublicDiscoverFilters = {
	q?: string;
	track?: string;
	format?: string;
	location?: string;
};

function normalizeNeedle(value: string | undefined): string {
	return value?.trim().toLowerCase() ?? "";
}

export function sessionMatchesQuery(
	session: PublicDiscoverSession,
	q: string | undefined,
): boolean {
	const needle = normalizeNeedle(q);
	if (!needle) return true;
	const haystack = [session.title, ...session.speakerNames]
		.join("\0")
		.toLowerCase();
	return haystack.includes(needle);
}

export function sessionMatchesFacets(
	session: PublicDiscoverSession,
	filters: Pick<PublicDiscoverFilters, "track" | "format" | "location">,
): boolean {
	const track = filters.track?.trim();
	if (track && track !== "all") {
		const trackKey = session.trackId ?? session.trackName;
		if (trackKey !== track && session.trackName !== track) return false;
	}
	const format = filters.format?.trim();
	if (format && format !== "all" && session.format !== format) return false;
	const location = filters.location?.trim();
	if (location && location !== "all" && session.location !== location) return false;
	return true;
}

export function filterPublicDiscoverSessions(
	sessions: readonly PublicDiscoverSession[],
	filters: PublicDiscoverFilters,
): PublicDiscoverSession[] {
	return sessions.filter(
		(session) =>
			sessionMatchesQuery(session, filters.q) && sessionMatchesFacets(session, filters),
	);
}

export function discoverFacetValues(
	sessions: readonly PublicDiscoverSession[],
	field: "trackName" | "format" | "location",
): string[] {
	const values = new Set<string>();
	for (const session of sessions) {
		const value = session[field]?.trim();
		if (value) values.add(value);
	}
	return [...values].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
}

export function truncatePreview(text: string, maxChars = 180): {
	preview: string;
	truncated: boolean;
} {
	const trimmed = text.trim();
	if (trimmed.length <= maxChars) {
		return { preview: trimmed, truncated: false };
	}
	const slice = trimmed.slice(0, maxChars);
	const breakAt = slice.lastIndexOf(" ");
	const preview = (breakAt > 40 ? slice.slice(0, breakAt) : slice).trimEnd();
	return { preview: `${preview}…`, truncated: true };
}
