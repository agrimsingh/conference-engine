import type { AccountRow, CfpFormRow, FormFieldRow } from "@/lib/db/types";
import { getEventBySlug } from "@/lib/db/queries";
import { digestReviewToken, newReviewToken, storedTokenMarker } from "@/lib/evaluation/tokens";
import { SYSTEM_CFP_FORM_SLUG } from "./create-event";
import { validateEventSettings } from "./settings";

export type CloneEventInput = {
	name: string;
	slug: string;
	timezone?: string;
	startDay: string;
	endDay: string;
};

export type CloneEventResult = {
	eventId: string;
	slug: string;
};

type SourceEventRow = {
	id: string;
	timezone: string;
	day_start_minutes: number;
	day_end_minutes: number;
	slot_duration_minutes: number;
	track_conflict_policy: string;
};

type SourceCriterion = {
	id: string;
	plan_id: string;
	label: string;
	description: string | null;
	weight: number;
	scale_min: number;
	scale_max: number;
	position: number;
};

type SourcePlan = {
	id: string;
	name: string;
	status: string;
};

type SourceRoom = { name: string; position: number };
type SourceTrack = { name: string; slug: string; position: number };
type SourceTask = { key: string; label: string; task_kind: "text" | "file"; required: number; position: number };
type SourceMessage = { template_key: string; subject_template: string; text_template: string };

/**
 * Configuration-only clone blueprint: remapped IDs for relational children.
 * Never includes submissions, people, memberships, reviewers, or deliveries.
 */
export type EventCloneBlueprint = {
	sourceEventId: string;
	event: SourceEventRow;
	forms: Array<{ form: CfpFormRow; fields: FormFieldRow[] }>;
	plans: Array<{ plan: SourcePlan; criteria: SourceCriterion[] }>;
	rooms: SourceRoom[];
	tracks: SourceTrack[];
	tasks: SourceTask[];
	messages: SourceMessage[];
};

async function loadEventCloneBlueprint(db: D1Database, sourceEventId: string): Promise<EventCloneBlueprint> {
	const event = await db
		.prepare(
			`SELECT id, timezone, day_start_minutes, day_end_minutes, slot_duration_minutes, track_conflict_policy
			 FROM events WHERE id = ?`,
		)
		.bind(sourceEventId)
		.first<SourceEventRow>();
	if (!event) throw new Error("Source event not found");

	const [formsResult, plansResult, rooms, tracks, tasks, messages] = await Promise.all([
		db.prepare(`SELECT * FROM cfp_forms WHERE event_id = ? ORDER BY kind DESC, created_at ASC`).bind(sourceEventId).all<CfpFormRow>(),
		db.prepare(`SELECT id, name, status FROM evaluation_plans WHERE event_id = ? ORDER BY created_at ASC`).bind(sourceEventId).all<SourcePlan>(),
		db.prepare(`SELECT name, position FROM event_rooms WHERE event_id = ? AND soft_deleted = 0 ORDER BY position, name`).bind(sourceEventId).all<SourceRoom>(),
		db.prepare(`SELECT name, slug, position FROM agenda_tracks WHERE event_id = ? AND soft_deleted = 0 ORDER BY position, name`).bind(sourceEventId).all<SourceTrack>(),
		db.prepare(`SELECT key, label, task_kind, required, position FROM task_templates WHERE event_id = ? AND soft_deleted = 0 ORDER BY position, key`).bind(sourceEventId).all<SourceTask>(),
		db.prepare(`SELECT template_key, subject_template, text_template FROM event_message_templates WHERE event_id = ? ORDER BY template_key`).bind(sourceEventId).all<SourceMessage>(),
	]);

	const forms: EventCloneBlueprint["forms"] = [];
	let systemFormsSeen = 0;
	for (const form of formsResult.results) {
		if (form.kind === "system") {
			systemFormsSeen += 1;
			if (systemFormsSeen > 1) continue;
		}
		const fields = await db
			.prepare(
				`SELECT * FROM form_fields WHERE form_id = ? AND soft_deleted = 0 ORDER BY position, key`,
			)
			.bind(form.id)
			.all<FormFieldRow>();
		forms.push({ form, fields: fields.results });
	}

	const plans: EventCloneBlueprint["plans"] = [];
	for (const plan of plansResult.results) {
		const criteria = await db
			.prepare(
				`SELECT id, plan_id, label, description, weight, scale_min, scale_max, position
				 FROM evaluation_criteria WHERE plan_id = ? AND soft_deleted = 0 ORDER BY position, label`,
			)
			.bind(plan.id)
			.all<SourceCriterion>();
		plans.push({ plan, criteria: criteria.results });
	}

	const taskKeys = new Set<string>();
	const uniqueTasks: SourceTask[] = [];
	for (const task of tasks.results) {
		if (taskKeys.has(task.key)) continue;
		taskKeys.add(task.key);
		uniqueTasks.push(task);
	}

	return {
		sourceEventId,
		event,
		forms,
		plans,
		rooms: rooms.results,
		tracks: tracks.results,
		tasks: uniqueTasks,
		messages: messages.results,
	};
}

export async function cloneEventConfiguration(
	db: D1Database,
	sourceEventId: string,
	args: CloneEventInput,
	owner: AccountRow | null,
): Promise<CloneEventResult> {
	const slug = args.slug.trim().toLowerCase();
	const name = args.name.trim();
	if (!name || name.length < 2) throw new Error("Event name required");
	if (!slug || !/^[a-z0-9-]+$/.test(slug)) {
		throw new Error("Slug must be lowercase letters, numbers, and hyphens");
	}
	if (await getEventBySlug(db, slug)) {
		throw new Error("An event with that slug already exists");
	}

	const blueprint = await loadEventCloneBlueprint(db, sourceEventId);
	const timezone = args.timezone?.trim() || blueprint.event.timezone;
	const schedule = validateEventSettings({
		startDay: args.startDay,
		endDay: args.endDay,
		timezone,
		dayStartMinutes: blueprint.event.day_start_minutes,
		dayEndMinutes: blueprint.event.day_end_minutes,
		slotDurationMinutes: blueprint.event.slot_duration_minutes,
	});
	if (!schedule.ok) throw new Error(schedule.error);

	const now = Date.now();
	const eventId = crypto.randomUUID();
	const statements: D1PreparedStatement[] = [
		db.prepare(
			`INSERT INTO events (
				id, slug, name, timezone, start_day, end_day, ownership_claimable,
				track_conflict_policy, day_start_minutes, day_end_minutes, slot_duration_minutes,
				mode, created_at, updated_at
			) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'live', ?, ?)`,
		).bind(
			eventId,
			slug,
			name,
			timezone,
			args.startDay,
			args.endDay,
			owner ? 0 : 1,
			blueprint.event.track_conflict_policy,
			blueprint.event.day_start_minutes,
			blueprint.event.day_end_minutes,
			blueprint.event.slot_duration_minutes,
			now,
			now,
		),
	];

	let copiedSystemForm = false;
	for (const { form, fields } of blueprint.forms) {
		const kind = form.kind === "system" ? "system" : "public";
		if (kind === "system") {
			if (copiedSystemForm) continue;
			copiedSystemForm = true;
		}
		const formId = crypto.randomUUID();
		statements.push(
			db.prepare(
				`INSERT INTO cfp_forms (
					id, event_id, slug, title, description, status, opens_at, closes_at,
					kind, category_routing_json, welcome_copy, confirmation_copy, reminder_copy,
					thank_you_copy, min_speakers, max_speakers, drafts_enabled, submission_limit,
					created_at, updated_at
				) VALUES (?, ?, ?, ?, ?, 'draft', NULL, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
			).bind(
				formId,
				eventId,
				kind === "system" ? (form.slug || SYSTEM_CFP_FORM_SLUG) : form.slug,
				form.title,
				form.description,
				kind,
				form.category_routing_json ?? null,
				form.welcome_copy,
				form.confirmation_copy,
				form.reminder_copy,
				form.thank_you_copy ?? null,
				form.min_speakers,
				form.max_speakers,
				form.drafts_enabled,
				form.submission_limit,
				now,
				now,
			),
		);
		for (const field of fields) {
			statements.push(
				db.prepare(
					`INSERT INTO form_fields (
						id, form_id, key, label, field_type, required, position,
						visibility_rule, config, soft_deleted
					) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
				).bind(
					crypto.randomUUID(),
					formId,
					field.key,
					field.label,
					field.field_type,
					field.required,
					field.position,
					field.visibility_rule,
					field.config,
				),
			);
		}
	}

	if (!copiedSystemForm) {
		statements.push(
			db.prepare(
				`INSERT INTO cfp_forms (
					id, event_id, slug, title, description, status, kind, opens_at, closes_at, created_at, updated_at
				) VALUES (?, ?, ?, 'System form', NULL, 'draft', 'system', NULL, NULL, ?, ?)`,
			).bind(crypto.randomUUID(), eventId, SYSTEM_CFP_FORM_SLUG, now, now),
		);
	}

	for (const { plan, criteria } of blueprint.plans) {
		const planId = crypto.randomUUID();
		const reviewerTokenDigest = await digestReviewToken(newReviewToken());
		statements.push(
			db.prepare(
				`INSERT INTO evaluation_plans (
					id, event_id, name, status, reviewer_token, reviewer_token_digest, created_at, updated_at
				) VALUES (?, ?, ?, 'draft', ?, ?, ?, ?)`,
			).bind(planId, eventId, plan.name, storedTokenMarker(planId), reviewerTokenDigest, now, now),
		);
		for (const criterion of criteria) {
			statements.push(
				db.prepare(
					`INSERT INTO evaluation_criteria (
						id, plan_id, label, description, weight, scale_min, scale_max, position,
						soft_deleted, created_at, updated_at
					) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
				).bind(
					crypto.randomUUID(),
					planId,
					criterion.label,
					criterion.description,
					criterion.weight,
					criterion.scale_min,
					criterion.scale_max,
					criterion.position,
					now,
					now,
				),
			);
		}
	}

	for (const room of blueprint.rooms) {
		statements.push(
			db.prepare(
				`INSERT INTO event_rooms (id, event_id, name, position, soft_deleted, created_at, updated_at)
				 VALUES (?, ?, ?, ?, 0, ?, ?)`,
			).bind(crypto.randomUUID(), eventId, room.name, room.position, now, now),
		);
	}

	for (const track of blueprint.tracks) {
		statements.push(
			db.prepare(
				`INSERT INTO agenda_tracks (id, event_id, name, slug, position, soft_deleted, created_at, updated_at)
				 VALUES (?, ?, ?, ?, ?, 0, ?, ?)`,
			).bind(crypto.randomUUID(), eventId, track.name, track.slug, track.position, now, now),
		);
	}

	for (const task of blueprint.tasks) {
		statements.push(
			db.prepare(
				`INSERT INTO task_templates (
					id, event_id, key, label, task_kind, required, position, soft_deleted, created_at, updated_at
				) VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
			).bind(
				crypto.randomUUID(),
				eventId,
				task.key,
				task.label,
				task.task_kind,
				task.required,
				task.position,
				now,
				now,
			),
		);
	}

	for (const message of blueprint.messages) {
		statements.push(
			db.prepare(
				`INSERT INTO event_message_templates (
					id, event_id, template_key, subject_template, text_template, created_at, updated_at
				) VALUES (?, ?, ?, ?, ?, ?, ?)`,
			).bind(
				crypto.randomUUID(),
				eventId,
				message.template_key,
				message.subject_template,
				message.text_template,
				now,
				now,
			),
		);
	}

	if (owner) {
		statements.push(
			db.prepare(
				`INSERT INTO event_memberships (id, event_id, account_id, role, created_at)
				 VALUES (?, ?, ?, 'admin', ?)`,
			).bind(crypto.randomUUID(), eventId, owner.id, now),
			db.prepare(
				`INSERT INTO event_ownership (event_id, account_id, created_at, updated_at)
				 VALUES (?, ?, ?, ?)`,
			).bind(eventId, owner.id, now, now),
		);
	}

	await db.batch(statements);
	return { eventId, slug };
}
