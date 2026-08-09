import { getEventById, getEventBySlug } from "@/lib/db/queries";
import type { EventRow } from "@/lib/db/types";

export class EventNotFoundError extends Error {
	readonly code = "EVENT_NOT_FOUND";
	readonly status = 404;

	constructor(readonly lookup: { eventId: string } | { slug: string }) {
		super("Event not found");
		this.name = "EventNotFoundError";
	}
}

/** A route can map this domain error directly to a 403 response. */
export class DemoEventWriteError extends Error {
	readonly code = "DEMO_EVENT_READ_ONLY";
	readonly status = 403;

	constructor(readonly event: EventRow) {
		super("Demo events are read-only");
		this.name = "DemoEventWriteError";
	}
}

export async function requireWritableEventById(
	db: D1Database,
	eventId: string,
): Promise<EventRow> {
	const event = await getEventById(db, eventId);
	if (!event) throw new EventNotFoundError({ eventId });
	assertEventWritable(event);
	return event;
}

export async function requireWritableEventBySlug(
	db: D1Database,
	slug: string,
): Promise<EventRow> {
	const event = await getEventBySlug(db, slug);
	if (!event) throw new EventNotFoundError({ slug });
	assertEventWritable(event);
	return event;
}

export function assertEventWritable(event: EventRow): void {
	if (event.mode === "demo") throw new DemoEventWriteError(event);
}
