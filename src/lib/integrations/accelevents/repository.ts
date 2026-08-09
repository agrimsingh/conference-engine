import {
	AcceleventsSecretError,
	decryptAcceleventsApiKey,
	encryptAcceleventsApiKey,
} from "./crypto";

export const ACCELEVENTS_SESSION_TYPE_FORMATS = [
	"IN_PERSON",
	"VIRTUAL",
	"HYBRID",
] as const;

export type AcceleventsSessionTypeFormat =
	(typeof ACCELEVENTS_SESSION_TYPE_FORMATS)[number];

type AcceleventsIntegrationRow = {
	event_id: string;
	event_url: string;
	external_event_id: number;
	session_type_format: AcceleventsSessionTypeFormat;
	encrypted_api_key: string;
	api_key_iv: string;
	last_sync_at: number | null;
	last_sync_error: string | null;
	auto_sync_enabled: number;
	created_at: number;
	updated_at: number;
};

export type AcceleventsIntegrationStatus = {
	readonly configured: boolean;
	readonly eventUrl: string | null;
	readonly externalEventId: number | null;
	readonly sessionTypeFormat: AcceleventsSessionTypeFormat | null;
	readonly lastSyncAt: number | null;
	readonly lastSyncError: string | null;
	readonly autoSyncEnabled: boolean;
};

export type AcceleventsIntegrationConfig = {
	readonly eventUrl: string;
	readonly externalEventId: number;
	readonly sessionTypeFormat: AcceleventsSessionTypeFormat;
	readonly apiKey: string;
};

export type AcceleventsSyncMapping = {
	readonly localKind: "speaker" | "session";
	readonly localId: string;
	readonly externalId: string | null;
	readonly sourceFingerprint: string;
	readonly syncState: "creating" | "synced";
};

function toStatus(row: AcceleventsIntegrationRow | null): AcceleventsIntegrationStatus {
	return row
		? {
				configured: true,
				eventUrl: row.event_url,
				externalEventId: row.external_event_id,
				sessionTypeFormat: row.session_type_format,
				lastSyncAt: row.last_sync_at,
				lastSyncError: row.last_sync_error,
				autoSyncEnabled: row.auto_sync_enabled === 1,
			}
		: {
				configured: false,
				eventUrl: null,
				externalEventId: null,
				sessionTypeFormat: null,
				lastSyncAt: null,
				lastSyncError: null,
				autoSyncEnabled: false,
			};
}

async function getIntegrationRow(
	db: D1Database,
	eventId: string,
): Promise<AcceleventsIntegrationRow | null> {
	return db
		.prepare("SELECT * FROM accelevents_integrations WHERE event_id = ?")
		.bind(eventId)
		.first<AcceleventsIntegrationRow>();
}

export async function getAcceleventsIntegrationStatus(
	db: D1Database,
	eventId: string,
): Promise<AcceleventsIntegrationStatus> {
	return toStatus(await getIntegrationRow(db, eventId));
}

export async function saveAcceleventsIntegration(
	db: D1Database,
	args: {
		readonly eventId: string;
		readonly eventUrl: string;
		readonly externalEventId: number;
		readonly sessionTypeFormat: AcceleventsSessionTypeFormat;
		readonly apiKey?: string;
		readonly secret: string;
		readonly autoSyncEnabled?: boolean;
	},
): Promise<AcceleventsIntegrationStatus> {
	const existing = await getIntegrationRow(db, args.eventId);
	const encrypted = args.apiKey
		? await encryptAcceleventsApiKey(args.apiKey, args.secret)
		: existing
			? { ciphertext: existing.encrypted_api_key, iv: existing.api_key_iv }
			: null;
	if (!encrypted) throw new AcceleventsSecretError("An Accelevents API key is required for a new connection");
	const now = Date.now();
	const autoSyncEnabled = args.autoSyncEnabled ?? (existing?.auto_sync_enabled === 1);
	const statements = [db
		.prepare(
			`INSERT INTO accelevents_integrations
			(event_id, event_url, external_event_id, session_type_format, encrypted_api_key, api_key_iv, auto_sync_enabled, created_at, updated_at)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
			ON CONFLICT(event_id) DO UPDATE SET
				event_url = excluded.event_url,
				external_event_id = excluded.external_event_id,
				session_type_format = excluded.session_type_format,
				encrypted_api_key = excluded.encrypted_api_key,
				api_key_iv = excluded.api_key_iv,
				auto_sync_enabled = excluded.auto_sync_enabled,
				last_sync_error = NULL,
				updated_at = excluded.updated_at`,
		)
		.bind(
			args.eventId,
			args.eventUrl,
			args.externalEventId,
			args.sessionTypeFormat,
			encrypted.ciphertext,
			encrypted.iv,
			autoSyncEnabled ? 1 : 0,
			now,
			now,
		),
	];
	if (existing && (existing.event_url !== args.eventUrl || existing.external_event_id !== args.externalEventId)) {
		statements.push(db.prepare("DELETE FROM accelevents_sync_mappings WHERE event_id = ?").bind(args.eventId));
	}
	await db.batch(statements);
	return getAcceleventsIntegrationStatus(db, args.eventId);
}

export async function loadAcceleventsIntegrationConfig(
	db: D1Database,
	eventId: string,
	secret: string,
): Promise<AcceleventsIntegrationConfig | null> {
	const row = await getIntegrationRow(db, eventId);
	if (!row) return null;
	return {
		eventUrl: row.event_url,
		externalEventId: row.external_event_id,
		sessionTypeFormat: row.session_type_format,
		apiKey: await decryptAcceleventsApiKey(
			{ ciphertext: row.encrypted_api_key, iv: row.api_key_iv },
			secret,
		),
	};
}

export async function deleteAcceleventsIntegration(
	db: D1Database,
	eventId: string,
): Promise<void> {
	await db.batch([
		db.prepare("DELETE FROM accelevents_sync_mappings WHERE event_id = ?").bind(eventId),
		db.prepare("DELETE FROM accelevents_integrations WHERE event_id = ?").bind(eventId),
	]);
}

export async function listAcceleventsSyncMappings(
	db: D1Database,
	eventId: string,
): Promise<readonly AcceleventsSyncMapping[]> {
	const rows = await db
		.prepare(
			`SELECT local_kind, local_id, external_id, source_fingerprint, sync_state
			 FROM accelevents_sync_mappings
			 WHERE event_id = ?`,
		)
		.bind(eventId)
		.all<{
			local_kind: "speaker" | "session";
			local_id: string;
			external_id: string | null;
			source_fingerprint: string;
			sync_state: "creating" | "synced";
		}>();
	return rows.results.map((row) => ({
		localKind: row.local_kind,
		localId: row.local_id,
		externalId: row.external_id,
		sourceFingerprint: row.source_fingerprint,
		syncState: row.sync_state,
	}));
}

export async function saveAcceleventsSyncMapping(
	db: D1Database,
	args: AcceleventsSyncMapping & { readonly eventId: string },
): Promise<void> {
	await db
		.prepare(
			`INSERT INTO accelevents_sync_mappings
			(id, event_id, local_kind, local_id, external_id, source_fingerprint, sync_state, last_synced_at)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?)
			ON CONFLICT(event_id, local_kind, local_id) DO UPDATE SET
				external_id = excluded.external_id,
				source_fingerprint = excluded.source_fingerprint,
				sync_state = excluded.sync_state,
				last_synced_at = excluded.last_synced_at`,
		)
		.bind(
			crypto.randomUUID(),
			args.eventId,
			args.localKind,
			args.localId,
			args.externalId,
			args.sourceFingerprint,
			args.syncState,
			Date.now(),
		)
		.run();
}

/**
 * Atomically records an uncertain create before any provider POST. The unique
 * mapping constraint is the claim: only its winner may make the request.
 */
export async function claimAcceleventsCreate(
	db: D1Database,
	args: {
		readonly eventId: string;
		readonly localKind: "speaker" | "session";
		readonly localId: string;
		readonly sourceFingerprint: string;
	},
): Promise<boolean> {
	const result = await db
		.prepare(
			`INSERT INTO accelevents_sync_mappings
			(id, event_id, local_kind, local_id, external_id, source_fingerprint, sync_state, last_synced_at)
			VALUES (?, ?, ?, ?, NULL, ?, 'creating', ?)
			ON CONFLICT(event_id, local_kind, local_id) DO NOTHING`,
		)
		.bind(
			crypto.randomUUID(),
			args.eventId,
			args.localKind,
			args.localId,
			args.sourceFingerprint,
			Date.now(),
		)
		.run();
	return (result.meta.changes ?? 0) === 1;
}

export async function recordAcceleventsSyncResult(
	db: D1Database,
	eventId: string,
	error: string | null,
): Promise<void> {
	await db
		.prepare(
			`UPDATE accelevents_integrations
			 SET last_sync_at = ?, last_sync_error = ?, updated_at = ?
			 WHERE event_id = ?`,
		)
		.bind(Date.now(), error, Date.now(), eventId)
		.run();
}
