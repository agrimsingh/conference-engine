import { loadSubmissionExportRows } from "@/lib/export/submissions-csv";
import {
	pushSubmissionsToAirtable,
	resolveAirtableConfig,
	type AirtableConfig,
} from "@/lib/export/airtable";

export type AirtableSyncEnv = {
	DB: D1Database;
	AIRTABLE_API_KEY?: string;
	AIRTABLE_BASE_ID?: string;
	AIRTABLE_TABLE_NAME?: string;
};

export type AirtableSyncRunResult = {
	syncedEvents: number;
	skippedEvents: number;
	upsertedRows: number;
	errors: Array<{ eventSlug: string; error: string }>;
	configurationError?: string;
};

export async function setAirtableSyncEnabled(
	db: D1Database,
	eventId: string,
	enabled: boolean,
): Promise<void> {
	await db.prepare(
		"UPDATE events SET airtable_sync_enabled = ?, updated_at = ? WHERE id = ?",
	).bind(enabled ? 1 : 0, Date.now(), eventId).run();
}

export async function getAirtableSyncEnabled(
	db: D1Database,
	eventId: string,
): Promise<boolean> {
	const row = await db.prepare(
		"SELECT airtable_sync_enabled FROM events WHERE id = ?",
	).bind(eventId).first<{ airtable_sync_enabled: number }>();
	return row?.airtable_sync_enabled === 1;
}

async function syncEventSubmissions(
	db: D1Database,
	config: AirtableConfig,
	event: { id: string; slug: string },
): Promise<{ ok: true; upserted: number } | { ok: false; error: string }> {
	const rows = await loadSubmissionExportRows(db, event.id);
	const result = await pushSubmissionsToAirtable(config, rows);
	if (!result.ok) return { ok: false, error: result.error };
	return { ok: true, upserted: result.upserted };
}

/** Nightly cron entry: sync every live event that opted in. */
export async function syncOptInEventsToAirtable(
	env: AirtableSyncEnv,
): Promise<AirtableSyncRunResult> {
	const config = resolveAirtableConfig(env);
	if (!config) {
		return {
			syncedEvents: 0,
			skippedEvents: 0,
			upsertedRows: 0,
			errors: [],
			configurationError: "Airtable is not configured",
		};
	}

	const events = await env.DB.prepare(
		`SELECT id, slug FROM events
     WHERE airtable_sync_enabled = 1
       AND mode <> 'demo'
       AND archived_at IS NULL
     ORDER BY slug ASC`,
	).all<{ id: string; slug: string }>();

	let syncedEvents = 0;
	let skippedEvents = 0;
	let upsertedRows = 0;
	const errors: Array<{ eventSlug: string; error: string }> = [];

	for (const event of events.results) {
		const result = await syncEventSubmissions(env.DB, config, event);
		if (!result.ok) {
			skippedEvents += 1;
			errors.push({ eventSlug: event.slug, error: result.error });
			continue;
		}
		syncedEvents += 1;
		upsertedRows += result.upserted;
	}

	return { syncedEvents, skippedEvents, upsertedRows, errors };
}
