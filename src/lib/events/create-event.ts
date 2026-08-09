import type { FormFieldDef } from "@/lib/domain/form-fields";
import type { AccountRow } from "@/lib/db/types";
import { DEFAULT_TASK_TEMPLATES } from "@/lib/domain/task-templates";
import { digestReviewToken, newReviewToken, storedTokenMarker } from "@/lib/evaluation/tokens";
import { validateEventSettings } from "./settings";

const DEFAULT_TIMEZONE = "America/Los_Angeles";
/** Reserved namespace for the hidden per-event form used by system workflows. */
export const SYSTEM_CFP_FORM_SLUG = "__system";

function defaultCfpFields(): FormFieldDef[] {
	return [
		{
			key: "title",
			label: "Title",
			fieldType: "text",
			required: true,
			position: 0,
			visibilityRule: { op: "always" },
			config: {
				kind: "text",
				maxLength: 160,
				placeholder: "Your session title",
			},
		},
		{
			key: "abstract",
			label: "Abstract",
			fieldType: "textarea",
			required: true,
			position: 1,
			visibilityRule: { op: "always" },
			config: {
				kind: "textarea",
				rows: 6,
				maxLength: 4000,
				placeholder: "What will attendees learn?",
			},
		},
		{
			key: "speakers",
			label: "Speakers",
			fieldType: "speaker_block",
			required: true,
			position: 2,
			visibilityRule: { op: "always" },
			config: { kind: "speaker_block", minSpeakers: 1, maxSpeakers: 4 },
		},
	];
}

export type CreateEventInput = {
	name: string;
	slug: string;
	timezone?: string;
	startDay: string;
	endDay: string;
};

export type CreateEventResult = {
	eventId: string;
	slug: string;
};

export async function createEventWithDefaults(
	db: D1Database,
	args: CreateEventInput,
	owner: AccountRow | null,
): Promise<CreateEventResult> {
	const slug = args.slug.trim().toLowerCase();
	const name = args.name.trim();
	const timezone = args.timezone?.trim() || DEFAULT_TIMEZONE;
	const schedule = validateEventSettings({ startDay: args.startDay, endDay: args.endDay, timezone });
	if (!schedule.ok) throw new Error(schedule.error);
	const now = Date.now();
	const eventId = crypto.randomUUID();
	const formId = crypto.randomUUID();
	const systemFormId = crypto.randomUUID();
	const planId = crypto.randomUUID();
	const criterionId = crypto.randomUUID();
	// A draft cannot issue a committee link. Store a non-secret marker and a
	// random digest in the creation batch so no raw bearer ever reaches D1.
	const reviewerTokenDigest = await digestReviewToken(newReviewToken());
	const statements: D1PreparedStatement[] = [
		db.prepare(`INSERT INTO events (id, slug, name, timezone, start_day, end_day, ownership_claimable, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(eventId, slug, name, timezone, args.startDay, args.endDay, owner ? 0 : 1, now, now),
		db.prepare(`INSERT INTO cfp_forms (id, event_id, slug, title, description, status, opens_at, closes_at, created_at, updated_at)
      VALUES (?, ?, 'cfp', ?, ?, 'draft', NULL, NULL, ?, ?)`).bind(formId, eventId, "Call for proposals", "Submit a session proposal.", now, now),
		db.prepare(`INSERT INTO cfp_forms (id, event_id, slug, title, description, status, kind, opens_at, closes_at, created_at, updated_at)
      VALUES (?, ?, ?, 'System form', NULL, 'draft', 'system', NULL, NULL, ?, ?)`).bind(systemFormId, eventId, SYSTEM_CFP_FORM_SLUG, now, now),
		db.prepare(`INSERT INTO evaluation_plans (id, event_id, name, status, reviewer_token, reviewer_token_digest, created_at, updated_at)
	      VALUES (?, ?, ?, 'draft', ?, ?, ?, ?)`).bind(planId, eventId, "Default review", storedTokenMarker(planId), reviewerTokenDigest, now, now),
		db.prepare(`INSERT INTO evaluation_criteria (id, plan_id, label, description, weight, scale_min, scale_max, position, soft_deleted, created_at, updated_at)
	      VALUES (?, ?, 'Overall', NULL, 1, 1, 5, 0, 0, ?, ?)`).bind(criterionId, planId, now, now),
	];
	for (const field of defaultCfpFields()) {
		statements.push(db.prepare(`INSERT INTO form_fields (id, form_id, key, label, field_type, required, position, visibility_rule, config, soft_deleted)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`).bind(
			crypto.randomUUID(), formId, field.key, field.label, field.fieldType,
			field.required ? 1 : 0, field.position, JSON.stringify(field.visibilityRule), JSON.stringify(field.config),
		));
	}
	for (const [position, roomName] of ["Main Stage", "Room B"].entries()) {
		statements.push(db.prepare(`INSERT INTO event_rooms (id, event_id, name, position, created_at, updated_at)
	      VALUES (?, ?, ?, ?, ?, ?)`).bind(crypto.randomUUID(), eventId, roomName, position, now, now));
	}
	statements.push(db.prepare(`INSERT INTO agenda_tracks (id, event_id, name, slug, position, soft_deleted, created_at, updated_at)
      VALUES (?, ?, 'General', 'general', 0, 0, ?, ?)`).bind(crypto.randomUUID(), eventId, now, now));
	for (const template of DEFAULT_TASK_TEMPLATES) {
		statements.push(db.prepare(`INSERT INTO task_templates (
      id, event_id, key, label, task_kind, required, position, soft_deleted, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`).bind(
			crypto.randomUUID(),
			eventId,
			template.key,
			template.label,
			template.taskKind,
			template.required ? 1 : 0,
			template.position,
			now,
			now,
		));
	}
	if (owner) {
		statements.push(
			db.prepare(`INSERT INTO event_memberships (id, event_id, account_id, role, created_at)
        VALUES (?, ?, ?, 'admin', ?)`).bind(crypto.randomUUID(), eventId, owner.id, now),
			db.prepare(`INSERT INTO event_ownership (event_id, account_id, created_at, updated_at)
        VALUES (?, ?, ?, ?)`).bind(eventId, owner.id, now, now),
		);
	}
	await db.batch(statements);

	return { eventId, slug };
}
