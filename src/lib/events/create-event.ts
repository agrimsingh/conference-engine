import type { FormFieldDef } from "@/lib/domain/form-fields";
import type { AccountRow } from "@/lib/db/types";

const DEFAULT_TIMEZONE = "America/Los_Angeles";

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

function mintReviewerToken(): string {
	const bytes = crypto.getRandomValues(new Uint8Array(18));
	let binary = "";
	for (const byte of bytes) {
		binary += String.fromCharCode(byte);
	}
	return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export type CreateEventInput = {
	name: string;
	slug: string;
	timezone?: string;
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
	const now = Date.now();
	const eventId = crypto.randomUUID();

	await db
		.prepare(
			`INSERT INTO events (id, slug, name, timezone, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
		)
		.bind(eventId, slug, name, timezone, now, now)
		.run();

	if (owner) {
		await db
			.prepare(
				`INSERT INTO event_memberships (id, event_id, account_id, role, created_at)
         VALUES (?, ?, ?, 'owner', ?)`,
			)
			.bind(crypto.randomUUID(), eventId, owner.id, now)
			.run();
	}

	await seedDefaultCfpForm(db, eventId, now);
	await seedDefaultEvaluationPlan(db, eventId, now);
	await seedDefaultRooms(db, eventId, now);

	return { eventId, slug };
}

async function seedDefaultCfpForm(
	db: D1Database,
	eventId: string,
	now: number,
): Promise<void> {
	const formId = crypto.randomUUID();
	await db
		.prepare(
			`INSERT INTO cfp_forms (
        id, event_id, slug, title, description, status, opens_at, closes_at, created_at, updated_at
      ) VALUES (?, ?, 'cfp', ?, ?, 'draft', NULL, NULL, ?, ?)`,
		)
		.bind(
			formId,
			eventId,
			"Call for proposals",
			"Submit a session proposal.",
			now,
			now,
		)
		.run();

	for (const field of defaultCfpFields()) {
		await db
			.prepare(
				`INSERT INTO form_fields (
          id, form_id, key, label, field_type, required, position, visibility_rule, config, soft_deleted
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
			)
			.bind(
				crypto.randomUUID(),
				formId,
				field.key,
				field.label,
				field.fieldType,
				field.required ? 1 : 0,
				field.position,
				JSON.stringify(field.visibilityRule),
				JSON.stringify(field.config),
			)
			.run();
	}
}

async function seedDefaultEvaluationPlan(
	db: D1Database,
	eventId: string,
	now: number,
): Promise<void> {
	await db
		.prepare(
			`INSERT INTO evaluation_plans (
        id, event_id, name, status, reviewer_token, created_at, updated_at
      ) VALUES (?, ?, ?, 'draft', ?, ?, ?)`,
		)
		.bind(
			crypto.randomUUID(),
			eventId,
			"Default review",
			mintReviewerToken(),
			now,
			now,
		)
		.run();
}

async function seedDefaultRooms(
	db: D1Database,
	eventId: string,
	now: number,
): Promise<void> {
	const rooms = ["Main Stage", "Room B"] as const;
	for (const [index, name] of rooms.entries()) {
		await db
			.prepare(
				`INSERT INTO event_rooms (id, event_id, name, position, created_at)
         VALUES (?, ?, ?, ?, ?)`,
			)
			.bind(crypto.randomUUID(), eventId, name, index, now)
			.run();
	}
}
