import { AIE_FORMAT_CATEGORY_ROUTE, displayCategory } from "@/lib/domain";

export type PublicEmbedFilters = {
	readonly trackIds: readonly string[];
	readonly formats: readonly string[];
	readonly rooms: readonly string[];
};

export type PublicEmbedFilterableSession = {
	readonly trackId: string | null;
	readonly format: string;
	readonly room: string;
};

export function publicSessionFormat(
	answers: Readonly<Record<string, unknown>>,
	category: string | null | undefined,
): string {
	const rawFormat = typeof answers.format === "string" ? answers.format.trim() : "";
	return rawFormat
		? AIE_FORMAT_CATEGORY_ROUTE.map[rawFormat] ?? rawFormat
		: displayCategory(category);
}

export function filterPublicEmbedSessions<T extends PublicEmbedFilterableSession>(
	sessions: readonly T[],
	filters: PublicEmbedFilters,
): T[] {
	return sessions.filter((session) =>
		(filters.trackIds.length === 0 || (session.trackId !== null && filters.trackIds.includes(session.trackId)))
		&& (filters.formats.length === 0 || filters.formats.includes(session.format))
		&& (filters.rooms.length === 0 || filters.rooms.includes(session.room)),
	);
}
