import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import {
	getSpeakerCrmDetail,
	listSpeakerCrmSummaries,
	updateSpeakerCrm,
} from "@/lib/speakers/crm";

const now = 1_780_600_000_000;

describe("speaker CRM service", () => {
	it("keeps owner, tags, notes, sent email, and completed tasks on the same event-scoped speaker timeline", async () => {
		// Given: a speaker, organizer owner, existing email delivery, and completed speaker task.
		await env.DB.batch([
			env.DB.prepare("INSERT INTO events (id, slug, name, timezone, created_at, updated_at) VALUES ('crm-event', 'crm-event', 'CRM Event', 'UTC', ?, ?)").bind(now, now),
			env.DB.prepare("INSERT INTO cfp_forms (id, event_id, slug, title, status, created_at, updated_at) VALUES ('crm-form', 'crm-event', 'cfp', 'CFP', 'open', ?, ?)").bind(now, now),
			env.DB.prepare("INSERT INTO submissions (id, form_id, event_id, status, answers_json, created_at, updated_at) VALUES ('crm-submission', 'crm-form', 'crm-event', 'accepted', '{}', ?, ?)").bind(now, now),
			env.DB.prepare("INSERT INTO people (id, email, name, created_at) VALUES ('crm-speaker', 'speaker@example.test', 'Speaker', ?)").bind(now),
			env.DB.prepare("INSERT INTO accounts (id, email, name, created_at, updated_at) VALUES ('crm-owner', 'owner@example.test', 'Owner', ?, ?)").bind(now, now),
			env.DB.prepare("INSERT INTO event_memberships (id, event_id, account_id, role, created_at) VALUES ('crm-membership', 'crm-event', 'crm-owner', 'admin', ?)").bind(now),
			env.DB.prepare("INSERT INTO email_deliveries (delivery_key, event_id, submission_id, template_key, to_email, subject, status, attempt_count, created_at, updated_at, sent_at) VALUES ('crm-email', 'crm-event', NULL, 'speaker_announcement', 'speaker@example.test', 'Welcome', 'sent', 1, ?, ?, ?)").bind(now, now, now + 1),
			env.DB.prepare("INSERT INTO speaker_tasks (id, event_id, submission_id, person_id, template_key, template_label, template_required, status, created_at, updated_at, completed_at) VALUES ('crm-task', 'crm-event', 'crm-submission', 'crm-speaker', 'bio', 'Speaker bio', 1, 'completed', ?, ?, ?)").bind(now, now, now + 2),
		]);

		// When: an organizer records ownership, a tag, an internal note, and a manual contact.
		const updated = await updateSpeakerCrm(env.DB, {
			eventId: "crm-event",
			personId: "crm-speaker",
			ownerAccountId: "crm-owner",
			tags: ["VIP"],
			note: "Needs green room access",
			contactNote: "Called after agenda update",
			authorAccountId: "crm-owner",
			now: now + 3,
		});

		// Then: the detail is tenant-scoped and surfaces the existing operational history.
		expect(updated.ok).toBe(true);
		const detail = await getSpeakerCrmDetail(env.DB, "crm-event", "crm-speaker");
		expect(detail).toMatchObject({
			owner: { accountId: "crm-owner", name: "Owner" },
			tags: ["VIP"],
			lastContactAt: now + 3,
		});
		expect(detail.timeline.map((entry) => entry.kind)).toEqual([
			"contact",
			"note",
			"task_completed",
			"email",
		]);
	});

	it("loads CRM summaries for 99, 100, and 101 speakers without exceeding D1 bind limits", async () => {
		// Given: an event with more than one D1 bind-window of CRM speaker profiles.
		const eventId = "crm-bind-limit-event";
		const personIds = Array.from({ length: 101 }, (_, index) => `crm-bind-limit-person-${index}`);
		const statements = [
			env.DB.prepare("INSERT INTO events (id, slug, name, timezone, created_at, updated_at) VALUES (?, ?, 'CRM bind limit', 'UTC', ?, ?)")
				.bind(eventId, eventId, now, now),
		];
		for (const personId of personIds) {
			statements.push(
				env.DB.prepare("INSERT INTO people (id, email, name, created_at) VALUES (?, ?, ?, ?)")
					.bind(personId, `${personId}@example.test`, personId, now),
				env.DB.prepare("INSERT INTO speaker_crm_profiles (event_id, person_id, owner_account_id, created_at, updated_at) VALUES (?, ?, NULL, ?, ?)")
					.bind(eventId, personId, now, now),
			);
		}
		await env.DB.batch(statements);

		// When: the roster requests each boundary-sized CRM summary set.
		const summaries99 = await listSpeakerCrmSummaries(env.DB, eventId, personIds.slice(0, 99));
		const summaries100 = await listSpeakerCrmSummaries(env.DB, eventId, personIds.slice(0, 100));
		const summaries101 = await listSpeakerCrmSummaries(env.DB, eventId, personIds);

		// Then: every requested speaker receives the empty CRM shape without a bind error.
		expect(summaries99.size).toBe(99);
		expect(summaries100.size).toBe(100);
		expect(summaries101.size).toBe(101);
		expect(summaries101.get("crm-bind-limit-person-100")).toEqual({
			owner: null,
			tags: [],
			lastContactAt: null,
		});
	});
});
