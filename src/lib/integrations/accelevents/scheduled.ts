import { validatedAppOrigin } from "@/lib/security/origin";
import {
	syncAcceleventsEvent,
	type AcceleventsSyncArgs,
	type AcceleventsSyncResult,
} from "./sync";

export type AcceleventsScheduledSyncEnv = {
	readonly DB: D1Database;
	readonly AUTH_SECRET?: string;
	readonly APP_ORIGIN?: string;
};

export type AcceleventsScheduledSyncResult = {
	readonly syncedEvents: number;
	readonly skippedEvents: number;
	readonly errors: readonly { readonly eventSlug: string; readonly error: string }[];
	readonly configurationError?: string;
};

type SyncRunner = (
	db: D1Database,
	args: AcceleventsSyncArgs,
) => Promise<AcceleventsSyncResult>;

type ScheduledEventRow = {
	id: string;
	slug: string;
	timezone: string;
};

export async function syncOptInEventsToAccelevents(
	env: AcceleventsScheduledSyncEnv,
	deps: { readonly sync: SyncRunner } = { sync: syncAcceleventsEvent },
): Promise<AcceleventsScheduledSyncResult> {
	if (!env.AUTH_SECRET) {
		return { syncedEvents: 0, skippedEvents: 0, errors: [], configurationError: "AUTH_SECRET is required" };
	}
	const appOrigin = validatedAppOrigin(env.APP_ORIGIN);
	if (!appOrigin) {
		return { syncedEvents: 0, skippedEvents: 0, errors: [], configurationError: "APP_ORIGIN must be an absolute HTTP(S) origin" };
	}
	const events = await env.DB.prepare(
		`SELECT e.id, e.slug, e.timezone
		 FROM events e
		 JOIN accelevents_integrations ai ON ai.event_id = e.id
		 WHERE ai.auto_sync_enabled = 1
			AND e.mode <> 'demo'
			AND e.archived_at IS NULL
		 ORDER BY e.slug ASC`,
	).all<ScheduledEventRow>();

	let syncedEvents = 0;
	let skippedEvents = 0;
	const errors: Array<{ eventSlug: string; error: string }> = [];
	for (const event of events.results) {
		try {
			const result = await deps.sync(env.DB, {
				eventId: event.id,
				eventSlug: event.slug,
				appOrigin,
				timezone: event.timezone,
				secret: env.AUTH_SECRET,
				dryRun: false,
			});
			if (!result.ok) {
				skippedEvents += 1;
				errors.push({
					eventSlug: event.slug,
					error: result.failures[0]?.message ?? "Accelevents sync failed",
				});
				continue;
			}
			syncedEvents += 1;
		} catch (error) {
			skippedEvents += 1;
			errors.push({
				eventSlug: event.slug,
				error: error instanceof Error ? error.message.slice(0, 500) : "Unknown Accelevents sync failure",
			});
		}
	}
	return { syncedEvents, skippedEvents, errors };
}
