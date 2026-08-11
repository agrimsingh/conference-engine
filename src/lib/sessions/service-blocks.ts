import type { AgendaVisibility, SubmissionRow } from "@/lib/db/types";
import { hasFormulaPrefix } from "@/lib/sessions/csv";
import { MAX_SESSION_TEXT, MAX_SESSION_TITLE, systemFormId } from "@/lib/sessions/session";

export const SERVICE_BLOCK_DURATIONS = [5, 10, 15, 30, 45, 60, 90, 120] as const;
export type ServiceBlockDurationMinutes = (typeof SERVICE_BLOCK_DURATIONS)[number];

export type ServiceBlockInput = {
	title: string;
	abstract?: string | null;
	durationMinutes: number;
	agendaVisibility: AgendaVisibility;
};

export type NormalizedServiceBlockInput = {
	title: string;
	abstract: string;
	durationMinutes: ServiceBlockDurationMinutes;
	agendaVisibility: AgendaVisibility;
};

function stringField(
	value: unknown,
	label: string,
	maximum: number,
	required = false,
): { value: string | null; error?: string } {
	if (value === undefined || value === null) {
		return required ? { value: null, error: `${label} is required` } : { value: null };
	}
	if (typeof value !== "string") return { value: null, error: `${label} must be text` };
	const trimmed = value.trim();
	if (required && !trimmed) return { value: null, error: `${label} is required` };
	if (trimmed.length > maximum) return { value: null, error: `${label} must be at most ${maximum} characters` };
	if (hasFormulaPrefix(trimmed)) {
		return { value: null, error: `${label} cannot begin with a spreadsheet formula prefix` };
	}
	return { value: trimmed || null };
}

export function isAgendaVisibility(value: unknown): value is AgendaVisibility {
	return value === "public" || value === "private";
}

export function isServiceBlockDuration(value: unknown): value is ServiceBlockDurationMinutes {
	return typeof value === "number" && (SERVICE_BLOCK_DURATIONS as readonly number[]).includes(value);
}

export function normalizeServiceBlockInput(
	raw: {
		title: unknown;
		abstract?: unknown;
		durationMinutes: unknown;
		agendaVisibility: unknown;
	},
): { ok: true; value: NormalizedServiceBlockInput } | { ok: false; issues: string[] } {
	const title = stringField(raw.title, "Title", MAX_SESSION_TITLE, true);
	const abstract = stringField(raw.abstract, "Abstract", MAX_SESSION_TEXT);
	const issues = [title.error, abstract.error].filter((value): value is string => Boolean(value));
	if (!isServiceBlockDuration(raw.durationMinutes)) {
		issues.push(`Duration must be one of ${SERVICE_BLOCK_DURATIONS.join(", ")} minutes`);
	}
	if (!isAgendaVisibility(raw.agendaVisibility)) {
		issues.push("Visibility must be public or private");
	}
	if (issues.length || !title.value || !isServiceBlockDuration(raw.durationMinutes) || !isAgendaVisibility(raw.agendaVisibility)) {
		return { ok: false, issues: [...new Set(issues)] };
	}
	return {
		ok: true,
		value: {
			title: title.value,
			abstract: abstract.value ?? "",
			durationMinutes: raw.durationMinutes,
			agendaVisibility: raw.agendaVisibility,
		},
	};
}

export function assertCanPublishAgendaVisibility(
	agendaVisibility: string | null | undefined,
): { ok: true } | { ok: false; error: string } {
	if ((agendaVisibility ?? "public") === "private") {
		return {
			ok: false,
			error: "Private service blocks stay off the public schedule. Set visibility to public before publishing.",
		};
	}
	return { ok: true };
}

export async function createServiceBlock(
	db: D1Database,
	args: { eventId: string; input: ServiceBlockInput },
): Promise<{ id: string; input: NormalizedServiceBlockInput }> {
	const normalized = normalizeServiceBlockInput(args.input);
	if (!normalized.ok) throw new Error(normalized.issues.join("; "));
	const formId = await systemFormId(db, args.eventId);
	const id = crypto.randomUUID();
	const now = Date.now();
	const answers = {
		title: normalized.value.title,
		abstract: normalized.value.abstract,
		duration_minutes: normalized.value.durationMinutes,
	};
	await db
		.prepare(
			`INSERT INTO submissions (
         id, form_id, event_id, status, origin, item_kind, agenda_visibility,
         answers_json, category, submitter_email, submitter_name, submitted_at,
         created_at, updated_at
       ) VALUES (?, ?, ?, 'accepted', 'manual', 'service', ?, ?, NULL, NULL, NULL, ?, ?, ?)`,
		)
		.bind(
			id,
			formId,
			args.eventId,
			normalized.value.agendaVisibility,
			JSON.stringify(answers),
			now,
			now,
			now,
		)
		.run();
	return { id, input: normalized.value };
}

export async function listServiceBlocks(db: D1Database, eventId: string): Promise<SubmissionRow[]> {
	const result = await db
		.prepare(
			`SELECT * FROM submissions
       WHERE event_id = ? AND item_kind = 'service'
       ORDER BY updated_at DESC`,
		)
		.bind(eventId)
		.all<SubmissionRow>();
	return result.results;
}

export async function deleteServiceBlock(
	db: D1Database,
	args: { eventId: string; submissionId: string },
): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
	const row = await db
		.prepare(
			`SELECT s.id, s.item_kind, s.status, a.id AS slot_id
       FROM submissions s
       LEFT JOIN agenda_slots a ON a.submission_id = s.id AND a.event_id = s.event_id
       WHERE s.id = ? AND s.event_id = ?`,
		)
		.bind(args.submissionId, args.eventId)
		.first<{ id: string; item_kind: string; status: string; slot_id: string | null }>();
	if (!row) return { ok: false, error: "Service block not found", status: 404 };
	if (row.item_kind !== "service") return { ok: false, error: "Not a service block", status: 400 };
	if (row.slot_id || row.status === "scheduled" || row.status === "published") {
		return { ok: false, error: "Unplace this service block before deleting it", status: 409 };
	}
	await db.batch([
		db
			.prepare(
				`DELETE FROM content_revisions
         WHERE event_id = ? AND entity_type = 'session' AND entity_id = ?`,
			)
			.bind(args.eventId, args.submissionId),
		db
			.prepare(
				`DELETE FROM content_heads
         WHERE event_id = ? AND entity_type = 'session' AND entity_id = ?`,
			)
			.bind(args.eventId, args.submissionId),
		db.prepare("DELETE FROM submissions WHERE id = ? AND event_id = ?").bind(args.submissionId, args.eventId),
	]);
	return { ok: true };
}
