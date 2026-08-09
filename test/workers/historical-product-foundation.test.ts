import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import migration0001 from "../../migrations/0001_core.sql?raw";
import migration0002 from "../../migrations/0002_speaker_tasks.sql?raw";
import migration0003 from "../../migrations/0003_evaluation_email_agenda.sql?raw";
import migration0004 from "../../migrations/0004_event_rooms.sql?raw";
import migration0005 from "../../migrations/0005_submission_category.sql?raw";
import migration0006 from "../../migrations/0006_reviewers.sql?raw";
import migration0007 from "../../migrations/0007_submission_labels.sql?raw";
import migration0008 from "../../migrations/0008_co_speakers.sql?raw";
import migration0009 from "../../migrations/0009_review_assignments.sql?raw";
import migration0010 from "../../migrations/0010_accounts.sql?raw";
import migration0011 from "../../migrations/0011_agenda_slot_room_id.sql?raw";
import migration0012 from "../../migrations/0012_production_hardening.sql?raw";
import migration0013 from "../../migrations/0013_final_gate_security.sql?raw";
import migration0014 from "../../migrations/0014_delivery_claim_hardening.sql?raw";
import migration0015 from "../../migrations/0015_product_foundation.sql?raw";

const historicalMigrations = [
	migration0001,
	migration0002,
	migration0003,
	migration0004,
	migration0005,
	migration0006,
	migration0007,
	migration0008,
	migration0009,
	migration0010,
	migration0011,
	migration0012,
	migration0013,
	migration0014,
];

const resetToEmptyDatabase = `
PRAGMA foreign_keys = OFF;
DROP TABLE IF EXISTS co_speaker_invitation_claims;
DROP TABLE IF EXISTS event_invitations;
DROP TABLE IF EXISTS auth_challenges;
DROP TABLE IF EXISTS email_deliveries;
DROP TABLE IF EXISTS submission_draft_tokens;
DROP TABLE IF EXISTS submission_drafts;
DROP TABLE IF EXISTS rate_limit_buckets;
DROP TABLE IF EXISTS production_hardening_migration_guard;
DROP TABLE IF EXISTS event_ownership;
DROP TABLE IF EXISTS event_memberships;
DROP TABLE IF EXISTS accounts;
DROP TABLE IF EXISTS review_assignments;
DROP TABLE IF EXISTS reviewers;
DROP TABLE IF EXISTS submission_labels;
DROP TABLE IF EXISTS event_rooms;
DROP TABLE IF EXISTS agenda_tracks;
DROP TABLE IF EXISTS agenda_slots;
DROP TABLE IF EXISTS evaluation_criteria;
DROP TABLE IF EXISTS outbound_messages;
DROP TABLE IF EXISTS evaluation_scores;
DROP TABLE IF EXISTS evaluation_plans;
DROP TABLE IF EXISTS speaker_tasks;
DROP TABLE IF EXISTS task_templates;
DROP TABLE IF EXISTS assets;
DROP TABLE IF EXISTS speaker_profiles;
DROP TABLE IF EXISTS submission_speakers;
DROP TABLE IF EXISTS submissions;
DROP TABLE IF EXISTS form_fields;
DROP TABLE IF EXISTS cfp_forms;
DROP TABLE IF EXISTS event_members;
DROP TABLE IF EXISTS people;
DROP TABLE IF EXISTS events;
DROP TABLE IF EXISTS d1_migrations;
PRAGMA foreign_keys = ON;
`;

function sqlStatements(sql: string): string[] {
	const statements: string[] = [];
	let current = "";
	let inTrigger = false;
	for (const line of sql.split("\n")) {
		current += `${line}\n`;
		if (/^\s*CREATE\s+TRIGGER\b/i.test(line)) inTrigger = true;
		const endsStatement = line.trimEnd().endsWith(";");
		const endsTrigger = /^\s*END;\s*$/i.test(line);
		if (endsStatement && (!inTrigger || endsTrigger)) {
			statements.push(current);
			current = "";
			inTrigger = false;
		}
	}
	if (current.trim()) throw new Error("Unterminated SQL statement in historical fixture");
	return statements;
}

async function exec(sql: string): Promise<void> {
	for (const statement of sqlStatements(sql)) {
		const executable = statement.replace(/^\s*--.*$/gm, "").trim();
		if (executable) await env.DB.prepare(executable).run();
	}
}

describe("0014 to 0015 historical product-foundation upgrade", () => {
	it("backfills partial templates and system forms through real collision paths", async () => {
		await exec(resetToEmptyDatabase);
		for (const migration of historicalMigrations) await exec(migration);

		const eventId = "historic-event";
		const eventHex = "686973746f7269632d6576656e74";
		const occupiedTemplateId = `foundation-task-template:${eventHex}:headshot:0`;
		const occupiedSystemFormId = `foundation-system-form:${eventHex}:0`;
		await env.DB.batch([
			env.DB.prepare("INSERT INTO events (id, slug, name, timezone, created_at, updated_at) VALUES (?, 'historic-event', 'Historic event', 'UTC', 1, 1)").bind(eventId),
			env.DB.prepare("INSERT INTO people (id, email, name, created_at) VALUES ('historic-person', 'historic@example.test', 'Historic speaker', 1)"),
			env.DB.prepare("INSERT INTO cfp_forms (id, event_id, slug, title, status, created_at, updated_at) VALUES ('historic-cfp', ?, 'cfp', 'CFP', 'open', 1, 1)").bind(eventId),
			env.DB.prepare("INSERT INTO cfp_forms (id, event_id, slug, title, status, created_at, updated_at) VALUES (?, ?, '__system', 'Occupied reserved slug', 'draft', 1, 1)").bind(occupiedSystemFormId, eventId),
			env.DB.prepare("INSERT INTO submissions (id, form_id, event_id, status, answers_json, created_at, updated_at) VALUES ('historic-submission', 'historic-cfp', ?, 'accepted', '{}', 1, 1)").bind(eventId),
			env.DB.prepare("INSERT INTO task_templates (id, event_id, key, label, task_kind, required, position) VALUES ('historic-bio', ?, 'bio', 'Historic bio', 'text', 1, 0)").bind(eventId),
			env.DB.prepare("INSERT INTO task_templates (id, event_id, key, label, task_kind, required, position) VALUES (?, ?, 'legacy', 'Legacy material', 'file', 0, 99)").bind(occupiedTemplateId, eventId),
			env.DB.prepare("INSERT INTO speaker_tasks (id, event_id, submission_id, person_id, template_key, status, created_at, updated_at) VALUES ('historic-task', ?, 'historic-submission', 'historic-person', 'bio', 'pending', 1, 1)").bind(eventId),
		]);

		await exec(migration0015);

		expect((await env.DB.prepare(
			"SELECT key, COUNT(*) AS count FROM task_templates WHERE event_id = ? AND key IN ('bio', 'headshot', 'slides', 'docs') AND soft_deleted = 0 GROUP BY key ORDER BY key",
		).bind(eventId).all<{ key: string; count: number }>()).results).toEqual([
			{ key: "bio", count: 1 },
			{ key: "docs", count: 1 },
			{ key: "headshot", count: 1 },
			{ key: "slides", count: 1 },
		]);
		expect(await env.DB.prepare(
			"SELECT id FROM task_templates WHERE event_id = ? AND key = 'headshot'",
		).bind(eventId).first()).toEqual({ id: `foundation-task-template:${eventHex}:headshot:1` });
		expect(await env.DB.prepare(
			"SELECT id, slug, kind FROM cfp_forms WHERE event_id = ? AND kind = 'system'",
		).bind(eventId).first()).toEqual({
			id: `foundation-system-form:${eventHex}:1`,
			slug: "__system-1",
			kind: "system",
		});
		expect(await env.DB.prepare(
			"SELECT COUNT(*) AS count FROM cfp_forms WHERE event_id = ? AND kind = 'system'",
		).bind(eventId).first()).toEqual({ count: 1 });
		expect(await env.DB.prepare(
			"SELECT template_label, template_task_kind, template_required FROM speaker_tasks WHERE id = 'historic-task'",
		).first()).toEqual({
			template_label: "Historic bio",
			template_task_kind: "text",
			template_required: 1,
		});
	});
});
