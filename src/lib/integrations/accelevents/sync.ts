import { createAcceleventsApi, type AcceleventsApi } from "./api";
import {
	claimAcceleventsCreate,
	listAcceleventsSyncMappings,
	loadAcceleventsIntegrationConfig,
	recordAcceleventsSyncResult,
	saveAcceleventsSyncMapping,
	type AcceleventsSessionTypeFormat,
	type AcceleventsSyncMapping,
} from "./repository";

export type AcceleventsSpeakerPayload = {
	readonly firstName: string;
	readonly lastName: string;
	readonly email: string;
	readonly bio: string;
	readonly company: string;
	readonly title: string;
};

export type AcceleventsSessionPayload = {
	readonly title: string;
	readonly description: string;
	readonly format: "OTHER";
	readonly sessionTypeFormat: AcceleventsSessionTypeFormat;
	readonly hideSessionFromAttendees: boolean;
	readonly startTime?: string;
	readonly endTime?: string;
};

type SyncSpeaker = {
	readonly localId: string;
	readonly name: string;
	readonly email: string;
	readonly bio: string | null;
	readonly jobTitle: string | null;
	readonly company: string | null;
};

type SyncSession = {
	readonly localId: string;
	readonly status: "accepted" | "scheduled" | "published";
	readonly title: string;
	readonly abstract: string;
	readonly startsAt: number | null;
	readonly endsAt: number | null;
};

type SyncPlanInput = {
	readonly sessionTypeFormat: AcceleventsSessionTypeFormat;
	readonly speakers: readonly SyncSpeaker[];
	readonly sessions: readonly SyncSession[];
	readonly mappings: readonly AcceleventsSyncMapping[];
	readonly timezone: string;
};

type AcceleventsSyncActionBase = {
	readonly kind: "speaker" | "session";
	readonly localId: string;
	readonly operation: "create" | "update" | "skip" | "reconcile";
	readonly externalId: string | null;
	readonly sourceFingerprint: string;
	readonly previousFingerprint: string | null;
};

type AcceleventsSpeakerSyncAction = AcceleventsSyncActionBase & {
	readonly kind: "speaker";
	readonly payload: AcceleventsSpeakerPayload;
};

type AcceleventsSessionSyncAction = AcceleventsSyncActionBase & {
	readonly kind: "session";
	readonly payload: AcceleventsSessionPayload;
};

export type AcceleventsSyncAction =
	| AcceleventsSpeakerSyncAction
	| AcceleventsSessionSyncAction;

export type AcceleventsSyncPlan = {
	readonly actions: readonly AcceleventsSyncAction[];
};

export type AcceleventsSyncFailure = {
	readonly kind: "speaker" | "session";
	readonly localId: string;
	readonly message: string;
};

export type AcceleventsSyncResult = {
	readonly ok: boolean;
	readonly dryRun: boolean;
	readonly configured: boolean;
	readonly actions: readonly AcceleventsSyncAction[];
	readonly failures: readonly AcceleventsSyncFailure[];
};

type SourceSpeakerRow = {
	person_id: string | null;
	name: string | null;
	email: string;
	bio: string | null;
	job_title: string | null;
	company: string | null;
};

type SourceSessionRow = {
	id: string;
	status: "accepted" | "scheduled" | "published";
	answers_json: string;
	starts_at: number | null;
	ends_at: number | null;
};

function trim(value: string | null | undefined): string {
	return value?.trim() ?? "";
}

function speakerPayload(speaker: SyncSpeaker): AcceleventsSpeakerPayload {
	const words = trim(speaker.name).split(/\s+/).filter(Boolean);
	return {
		firstName: words[0] ?? speaker.email,
		lastName: words.slice(1).join(" ") || "-",
		email: speaker.email.trim().toLowerCase(),
		bio: trim(speaker.bio),
		company: trim(speaker.company),
		title: trim(speaker.jobTitle),
	};
}

function formatAcceleventsTime(timestamp: number, timezone: string): string {
	const date = new Date(timestamp);
	const parts = new Intl.DateTimeFormat("en-CA", {
		timeZone: timezone,
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
		hour: "2-digit",
		minute: "2-digit",
		hourCycle: "h23",
	}).formatToParts(date);
	const value = (kind: Intl.DateTimeFormatPartTypes): string =>
		parts.find((part) => part.type === kind)?.value ?? "";
	return `${value("year")}/${value("month")}/${value("day")} ${value("hour")}:${value("minute")}`;
}

function sessionPayload(
	session: SyncSession,
	timezone: string,
	sessionTypeFormat: AcceleventsSessionTypeFormat,
): AcceleventsSessionPayload {
	const schedule = session.startsAt !== null && session.endsAt !== null
		? {
				startTime: formatAcceleventsTime(session.startsAt, timezone),
				endTime: formatAcceleventsTime(session.endsAt, timezone),
			}
		: {};
	return {
		title: session.title,
		description: session.abstract,
		format: "OTHER",
		sessionTypeFormat,
		hideSessionFromAttendees: session.status !== "published",
		...schedule,
	};
}

function mappingFor(
	mappings: readonly AcceleventsSyncMapping[],
	kind: "speaker" | "session",
	localId: string,
): AcceleventsSyncMapping | undefined {
	return mappings.find((mapping) => mapping.localKind === kind && mapping.localId === localId);
}

function operationFor(
	payload: AcceleventsSpeakerPayload | AcceleventsSessionPayload,
	mapping: AcceleventsSyncMapping | undefined,
): Pick<AcceleventsSyncActionBase, "operation" | "externalId" | "sourceFingerprint" | "previousFingerprint"> {
	const sourceFingerprint = JSON.stringify(payload);
	return {
		operation: mapping?.syncState === "creating"
			? "reconcile"
			: mapping?.sourceFingerprint === sourceFingerprint
			? "skip"
			: mapping ? "update" : "create",
		externalId: mapping?.externalId ?? null,
		sourceFingerprint,
		previousFingerprint: mapping?.sourceFingerprint ?? null,
	};
}

export function buildAcceleventsSyncPlan(input: SyncPlanInput): AcceleventsSyncPlan {
	const speakerActions = input.speakers.map((speaker) => {
		const payload = speakerPayload(speaker);
		return ({
			kind: "speaker",
			localId: speaker.localId,
			payload,
			...operationFor(
				payload,
				mappingFor(input.mappings, "speaker", speaker.localId),
			),
		}) satisfies AcceleventsSpeakerSyncAction;
	});
	const sessionActions = input.sessions.map((session) => {
		const payload = sessionPayload(session, input.timezone, input.sessionTypeFormat);
		return ({
			kind: "session",
			localId: session.localId,
			payload,
			...operationFor(
				payload,
				mappingFor(input.mappings, "session", session.localId),
			),
		}) satisfies AcceleventsSessionSyncAction;
	});
	return { actions: [...speakerActions, ...sessionActions] };
}

function readSessionContent(value: string): { readonly title: string; readonly abstract: string } {
	try {
		const parsed: unknown = JSON.parse(value);
		if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
			const title = Reflect.get(parsed, "title");
			const abstract = Reflect.get(parsed, "abstract");
			return {
				title: typeof title === "string" && title.trim() ? title.trim() : "(untitled)",
				abstract: typeof abstract === "string" ? abstract.trim() : "",
			};
		}
	} catch {
		// Invalid legacy CFP data is projected as an explicitly untitled session.
	}
	return { title: "(untitled)", abstract: "" };
}

async function loadSyncSources(
	db: D1Database,
	eventId: string,
): Promise<{ readonly speakers: readonly SyncSpeaker[]; readonly sessions: readonly SyncSession[] }> {
	const [speakerRows, sessionRows] = await Promise.all([
		db.prepare(
			`SELECT ss.person_id, COALESCE(p.name, ss.name) AS name, ss.email,
				sp.bio, COALESCE(sp.job_title, esp.job_title) AS job_title,
				COALESCE(sp.company, esp.company) AS company
			 FROM submission_speakers ss
			 JOIN submissions s ON s.id = ss.submission_id
			 LEFT JOIN people p ON p.id = ss.person_id
			 LEFT JOIN speaker_profiles sp ON sp.event_id = s.event_id AND sp.person_id = ss.person_id
			 LEFT JOIN event_speaker_profiles esp ON esp.event_id = s.event_id AND esp.person_id = ss.person_id
			 WHERE s.event_id = ?
				AND s.status IN ('accepted', 'scheduled', 'published')
				AND ss.status IN ('pending', 'confirmed')
			 ORDER BY lower(ss.email) ASC, ss.position ASC`,
		).bind(eventId).all<SourceSpeakerRow>(),
		db.prepare(
			`SELECT s.id, s.status, s.answers_json, a.starts_at, a.ends_at
			 FROM submissions s
			 LEFT JOIN agenda_slots a ON a.submission_id = s.id AND a.event_id = s.event_id
			 WHERE s.event_id = ? AND s.status IN ('accepted', 'scheduled', 'published')
			 ORDER BY s.created_at ASC`,
		).bind(eventId).all<SourceSessionRow>(),
	]);

	const speakersById = new Map<string, SyncSpeaker>();
	for (const row of speakerRows.results) {
		const localId = row.person_id ? `person:${row.person_id}` : `email:${row.email.trim().toLowerCase()}`;
		if (!speakersById.has(localId)) {
			speakersById.set(localId, {
				localId,
				name: row.name ?? "",
				email: row.email,
				bio: row.bio,
				jobTitle: row.job_title,
				company: row.company,
			});
		}
	}
	return {
		speakers: [...speakersById.values()],
		sessions: sessionRows.results.map((row) => {
			const content = readSessionContent(row.answers_json);
			return {
				localId: row.id,
				status: row.status,
				title: content.title,
				abstract: content.abstract,
				startsAt: row.starts_at,
				endsAt: row.ends_at,
			};
		}),
	};
}

function actionFailure(action: AcceleventsSyncAction, error: unknown): AcceleventsSyncFailure {
	const message = error instanceof Error ? error.message : "Unknown Accelevents request failure";
	return { kind: action.kind, localId: action.localId, message: message.slice(0, 500) };
}

export async function syncAcceleventsEvent(
	db: D1Database,
	args: {
		readonly eventId: string;
		readonly timezone: string;
		readonly secret: string;
		readonly dryRun: boolean;
		readonly api?: AcceleventsApi;
	},
): Promise<AcceleventsSyncResult> {
	const [status, mappings, sources] = await Promise.all([
		db.prepare(
			"SELECT session_type_format, external_event_id FROM accelevents_integrations WHERE event_id = ?",
		).bind(args.eventId).first<{ session_type_format: AcceleventsSessionTypeFormat; external_event_id: number }>(),
		listAcceleventsSyncMappings(db, args.eventId),
		loadSyncSources(db, args.eventId),
	]);
	if (!status) return { ok: false, dryRun: args.dryRun, configured: false, actions: [], failures: [] };
	const plan = buildAcceleventsSyncPlan({
		sessionTypeFormat: status.session_type_format,
		speakers: sources.speakers,
		sessions: sources.sessions,
		mappings,
		timezone: args.timezone,
	});
	if (args.dryRun) return { ok: true, dryRun: true, configured: true, actions: plan.actions, failures: [] };

	const config = await loadAcceleventsIntegrationConfig(db, args.eventId, args.secret);
	if (!config) return { ok: false, dryRun: false, configured: false, actions: [], failures: [] };
	const api = args.api ?? createAcceleventsApi(config);
	const failures: AcceleventsSyncFailure[] = [];
	for (const action of plan.actions) {
		if (action.operation === "skip") continue;
		try {
			let externalId = action.externalId;
			if (action.operation === "reconcile") {
				if (action.kind !== "speaker") {
					throw new Error("A prior Accelevents session create has an unknown outcome. The documented session list has no safe stable marker, so this item will not POST again. Reconcile it manually before retrying.");
				}
				externalId = await api.findSpeakerByEmail(status.external_event_id, action.payload.email);
				if (!externalId) {
					throw new Error("A prior Accelevents speaker create has an unknown outcome and no exact email match was found. This item will not POST again; reconcile it manually before retrying.");
				}
				if (action.previousFingerprint !== action.sourceFingerprint) {
					await api.updateSpeaker(externalId, action.payload);
				}
				await saveAcceleventsSyncMapping(db, {
					eventId: args.eventId,
					localKind: action.kind,
					localId: action.localId,
					externalId,
					sourceFingerprint: action.sourceFingerprint,
					syncState: "synced",
				});
				continue;
			}
			if (action.operation === "create") {
				const claimed = await claimAcceleventsCreate(db, {
					eventId: args.eventId,
					localKind: action.kind,
					localId: action.localId,
					sourceFingerprint: action.sourceFingerprint,
				});
				if (!claimed) {
					throw new Error("Another Accelevents sync has claimed this create. It will be reconciled before any later retry; this run did not POST it.");
				}
			}
			if (action.kind === "speaker") {
				if (action.operation === "create") externalId = await api.createSpeaker(action.payload);
				else if (externalId) await api.updateSpeaker(externalId, action.payload);
			} else {
				if (action.operation === "create") externalId = await api.createSession(action.payload);
				else if (externalId) await api.updateSession(externalId, action.payload);
			}
			if (!externalId) throw new Error("Accelevents mapping is missing an external ID");
			await saveAcceleventsSyncMapping(db, {
				eventId: args.eventId,
				localKind: action.kind,
				localId: action.localId,
				externalId,
				sourceFingerprint: action.sourceFingerprint,
				syncState: "synced",
			});
		} catch (error) {
			failures.push(actionFailure(action, error));
		}
	}
	await recordAcceleventsSyncResult(
		db,
		args.eventId,
		failures[0]?.message ?? null,
	);
	return {
		ok: failures.length === 0,
		dryRun: false,
		configured: true,
		actions: plan.actions,
		failures,
	};
}
