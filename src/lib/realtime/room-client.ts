export function roomTicketPath(eventSlug: string): string {
	return `/api/admin/events/${encodeURIComponent(eventSlug)}/room`;
}

/** Mint or refresh the HttpOnly room-ticket cookie before each WS attempt. */
export async function bootstrapRoomTicket(
	eventSlug: string,
	fetchImpl: typeof fetch = fetch,
): Promise<{ ok: true } | { ok: false; error: string }> {
	try {
		const response = await fetchImpl(roomTicketPath(eventSlug), {
			method: "GET",
			credentials: "include",
			cache: "no-store",
		});
		if (response.ok) return { ok: true };
		return { ok: false, error: `Room bootstrap failed (HTTP ${response.status})` };
	} catch {
		return { ok: false, error: "Room bootstrap failed" };
	}
}
