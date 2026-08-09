const STORAGE_PREFIX = "conference-engine:itinerary:v1:";

export function itineraryStorageKey(eventSlug: string): string {
	return `${STORAGE_PREFIX}${encodeURIComponent(eventSlug)}`;
}

export function parseItinerarySelection(
	raw: string | null,
	eventSlug: string,
	availableSessionIds: readonly string[],
): string[] {
	if (!raw) return [];
	try {
		const value: unknown = JSON.parse(raw);
		if (
			typeof value !== "object" ||
			value === null ||
			!("version" in value) ||
			value.version !== 1 ||
			!("eventSlug" in value) ||
			value.eventSlug !== eventSlug ||
			!("sessionIds" in value) ||
			!Array.isArray(value.sessionIds)
		) return [];

		const available = new Set(availableSessionIds);
		return [...new Set(
			value.sessionIds.filter(
				(id): id is string => typeof id === "string" && available.has(id),
			),
		)];
	} catch {
		return [];
	}
}

export function serializeItinerarySelection(eventSlug: string, sessionIds: readonly string[]): string {
	return JSON.stringify({ version: 1, eventSlug, sessionIds: [...new Set(sessionIds)] });
}

export function setSessionSelected(
	current: readonly string[],
	sessionId: string,
	selected: boolean,
): string[] {
	const next = new Set(current);
	if (selected) next.add(sessionId);
	else next.delete(sessionId);
	return [...next];
}
