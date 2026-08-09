import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { createEventWithDefaults, SYSTEM_CFP_FORM_SLUG } from "@/lib/events/create-event";
import { MissingTaskTemplatesError, materializeAcceptedSpeaker } from "@/lib/speakers/materialize";
import { acceptSubmission } from "@/lib/speakers/accept";
import { confirmCoSpeaker } from "@/lib/speakers/co-speakers";
import { listFormsForEvent } from "@/lib/cfp/form-admin";
import { loadCfpForm } from "@/lib/cfp/load-form";
import { getOpenForm } from "@/lib/db/queries";
import { requireWritableEventById } from "@/lib/events/writability";
import type { AccountRow, SubmissionSpeakerRow } from "@/lib/db/types";

const now = 1_780_000_000_000;

const owner: AccountRow = {
	id: "foundation-owner",
	email: "owner@foundation.test",
	name: "Foundation owner",
	created_at: now,
	updated_at: now,
};

describe("product foundation migration", () => {
	it("creates a live event with public and hidden system forms plus all task defaults", async () => {
		await env.DB.prepare(
			"INSERT INTO accounts (id, email, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
		).bind(owner.id, owner.email, owner.name, now, now).run();
		const created = await createEventWithDefaults(env.DB, {
			name: "Foundation event",
			slug: "foundation-event",
			timezone: "Asia/Singapore",
			startDay: "2026-09-01",
			endDay: "2026-09-02",
		}, owner);

		expect(await requireWritableEventById(env.DB, created.eventId)).toMatchObject({
			id: created.eventId,
			mode: "live",
			track_conflict_policy: "hard",
		});
		expect(await env.DB.prepare(
			"SELECT slug, kind, status FROM cfp_forms WHERE event_id = ? ORDER BY kind, slug",
		).bind(created.eventId).all<{ slug: string; kind: string; status: string }>()).toEqual({
			results: [
				{ slug: "cfp", kind: "public", status: "draft" },
				{ slug: SYSTEM_CFP_FORM_SLUG, kind: "system", status: "draft" },
			],
			success: true,
			meta: expect.anything(),
		});
		expect((await env.DB.prepare(
			"SELECT key, label, task_kind, required, position, soft_deleted FROM task_templates WHERE event_id = ? ORDER BY position",
		).bind(created.eventId).all()).results).toEqual([
			{ key: "bio", label: "Speaker bio", task_kind: "text", required: 1, position: 0, soft_deleted: 0 },
			{ key: "headshot", label: "Headshot", task_kind: "file", required: 1, position: 1, soft_deleted: 0 },
			{ key: "slides", label: "Slides", task_kind: "file", required: 1, position: 2, soft_deleted: 0 },
			{ key: "docs", label: "Supporting docs", task_kind: "file", required: 1, position: 3, soft_deleted: 0 },
		]);
		const plan = await env.DB.prepare(
			"SELECT id, reviewer_token, reviewer_token_digest FROM evaluation_plans WHERE event_id = ?",
		).bind(created.eventId).first<{ id: string; reviewer_token: string; reviewer_token_digest: string }>();
		expect(plan).toMatchObject({ reviewer_token: `digest:${plan?.id}` });
		expect(plan?.reviewer_token_digest).toMatch(/^[A-Za-z0-9_-]{43}$/);
	});

	it("materializes only active D1 templates and fails clearly when an event has none", async () => {
		await env.DB.prepare(
			"INSERT INTO events (id, slug, name, timezone, created_at, updated_at) VALUES ('template-event', 'template-event', 'Template event', 'UTC', ?, ?)",
		).bind(now, now).run();
		await expect(materializeAcceptedSpeaker(env.DB, {
			eventId: "template-event",
			submissionId: "missing-submission",
			speaker: { id: "missing-speaker", submission_id: "missing-submission", person_id: null, name: "Missing", email: "missing@templates.test", bio: null, position: 0, status: "confirmed", invited_at: null, confirmed_at: null, added_after_acceptance: 0, confirm_token_hash: null },
		}, now)).rejects.toBeInstanceOf(MissingTaskTemplatesError);

		await env.DB.batch([
			env.DB.prepare("INSERT INTO cfp_forms (id, event_id, slug, title, status, created_at, updated_at) VALUES ('template-form', 'template-event', 'cfp', 'CFP', 'draft', ?, ?)").bind(now, now),
			env.DB.prepare("INSERT INTO submissions (id, form_id, event_id, status, answers_json, created_at, updated_at) VALUES ('template-submission', 'template-form', 'template-event', 'accepted', '{}', ?, ?)").bind(now, now),
			env.DB.prepare("INSERT INTO task_templates (id, event_id, key, label, task_kind, required, position, soft_deleted, created_at, updated_at) VALUES ('template-active', 'template-event', 'custom-material', 'Custom material', 'file', 1, 0, 0, ?, ?)").bind(now, now),
			env.DB.prepare("INSERT INTO task_templates (id, event_id, key, label, task_kind, required, position, soft_deleted, created_at, updated_at) VALUES ('template-deleted', 'template-event', 'retired-material', 'Retired material', 'file', 1, 1, 1, ?, ?)").bind(now, now),
		]);
		const speaker: SubmissionSpeakerRow = {
			id: "template-speaker",
			submission_id: "template-submission",
			person_id: null,
			name: "Template speaker",
			email: "speaker@templates.test",
			bio: null,
			position: 0,
			status: "confirmed",
			invited_at: null,
			confirmed_at: null,
			added_after_acceptance: 0,
			confirm_token_hash: null,
		};
		expect((await materializeAcceptedSpeaker(env.DB, {
			eventId: "template-event",
			submissionId: "template-submission",
			speaker,
		}, now)).spawnedTaskKeys).toEqual(["custom-material"]);
		await env.DB.prepare(
			"UPDATE task_templates SET label = 'Changed later', task_kind = 'text', required = 0 WHERE id = 'template-active'",
		).run();
		expect((await env.DB.prepare(
			"SELECT template_key, template_label, template_task_kind, template_required FROM speaker_tasks WHERE submission_id = 'template-submission'",
		).all()).results).toEqual([{
			template_key: "custom-material",
			template_label: "Custom material",
			template_task_kind: "file",
			template_required: 1,
		}]);
	});

	it("enforces active agenda-track uniqueness and supports retired track values", async () => {
		await env.DB.prepare(
			"INSERT INTO events (id, slug, name, timezone, created_at, updated_at) VALUES ('tracks-event', 'tracks-event', 'Tracks event', 'UTC', ?, ?)",
		).bind(now, now).run();
		await env.DB.prepare(
			"INSERT INTO agenda_tracks (id, event_id, name, slug, position, created_at, updated_at) VALUES ('track-one', 'tracks-event', 'Main', 'main', 0, ?, ?)",
		).bind(now, now).run();
		await expect(env.DB.prepare(
			"INSERT INTO agenda_tracks (id, event_id, name, slug, position, created_at, updated_at) VALUES ('track-duplicate', 'tracks-event', 'Main', 'main-two', 1, ?, ?)",
		).bind(now, now).run()).rejects.toThrow();
		await env.DB.prepare("UPDATE agenda_tracks SET soft_deleted = 1 WHERE id = 'track-one'").run();
		await expect(env.DB.prepare(
			"INSERT INTO agenda_tracks (id, event_id, name, slug, position, created_at, updated_at) VALUES ('track-reused', 'tracks-event', 'Main', 'main', 0, ?, ?)",
		).bind(now, now).run()).resolves.toBeDefined();
	});

	it("does not accept a submission when the event has no active templates", async () => {
		await env.DB.batch([
			env.DB.prepare("INSERT INTO events (id, slug, name, timezone, created_at, updated_at) VALUES ('accept-preflight-event', 'accept-preflight-event', 'Accept preflight', 'UTC', ?, ?)").bind(now, now),
			env.DB.prepare("INSERT INTO cfp_forms (id, event_id, slug, title, status, created_at, updated_at) VALUES ('accept-preflight-form', 'accept-preflight-event', 'cfp', 'CFP', 'open', ?, ?)").bind(now, now),
			env.DB.prepare("INSERT INTO submissions (id, form_id, event_id, status, answers_json, created_at, updated_at) VALUES ('accept-preflight-submission', 'accept-preflight-form', 'accept-preflight-event', 'submitted', '{}', ?, ?)").bind(now, now),
			env.DB.prepare("INSERT INTO submission_speakers (id, submission_id, name, email, position, status) VALUES ('accept-preflight-speaker', 'accept-preflight-submission', 'Accepted speaker', 'accepted@preflight.test', 0, 'confirmed')"),
		]);

		expect(await acceptSubmission(env.DB, "accept-preflight-submission", { send: false })).toMatchObject({
			ok: false,
			status: 500,
			error: "Event accept-preflight-event has no active task templates",
		});
		expect(await env.DB.prepare("SELECT status FROM submissions WHERE id = 'accept-preflight-submission'").first()).toEqual({ status: "submitted" });
		expect(await env.DB.prepare("SELECT COUNT(*) AS count FROM people WHERE email = 'accepted@preflight.test'").first()).toEqual({ count: 0 });
		expect(await env.DB.prepare("SELECT COUNT(*) AS count FROM speaker_profiles WHERE event_id = 'accept-preflight-event'").first()).toEqual({ count: 0 });
		expect(await env.DB.prepare("SELECT COUNT(*) AS count FROM speaker_tasks WHERE submission_id = 'accept-preflight-submission'").first()).toEqual({ count: 0 });
	});

	it("keeps a post-acceptance co-speaker pending until templates exist, then retries safely", async () => {
		await env.DB.batch([
			env.DB.prepare("INSERT INTO events (id, slug, name, timezone, created_at, updated_at) VALUES ('confirm-preflight-event', 'confirm-preflight-event', 'Confirm preflight', 'UTC', ?, ?)").bind(now, now),
			env.DB.prepare("INSERT INTO cfp_forms (id, event_id, slug, title, status, created_at, updated_at) VALUES ('confirm-preflight-form', 'confirm-preflight-event', 'cfp', 'CFP', 'open', ?, ?)").bind(now, now),
			env.DB.prepare("INSERT INTO submissions (id, form_id, event_id, status, answers_json, created_at, updated_at) VALUES ('confirm-preflight-submission', 'confirm-preflight-form', 'confirm-preflight-event', 'accepted', '{}', ?, ?)").bind(now, now),
			env.DB.prepare("INSERT INTO submission_speakers (id, submission_id, name, email, position, status) VALUES ('confirm-preflight-speaker', 'confirm-preflight-submission', 'Pending speaker', 'pending@preflight.test', 1, 'pending')"),
		]);

		expect(await confirmCoSpeaker(env.DB, "confirm-preflight-speaker")).toMatchObject({ ok: false, status: 500 });
		expect(await env.DB.prepare("SELECT status, confirmed_at FROM submission_speakers WHERE id = 'confirm-preflight-speaker'").first()).toEqual({ status: "pending", confirmed_at: null });
		expect(await env.DB.prepare("SELECT COUNT(*) AS count FROM speaker_tasks WHERE submission_id = 'confirm-preflight-submission'").first()).toEqual({ count: 0 });

		await env.DB.prepare(
			"INSERT INTO task_templates (id, event_id, key, label, task_kind, required, position, soft_deleted, created_at, updated_at) VALUES ('confirm-preflight-template', 'confirm-preflight-event', 'bio', 'Speaker bio', 'text', 1, 0, 0, ?, ?)",
		).bind(now, now).run();
		expect(await confirmCoSpeaker(env.DB, "confirm-preflight-speaker")).toMatchObject({ ok: true, spawnedTaskKeys: ["bio"] });
		expect(await env.DB.prepare("SELECT status FROM submission_speakers WHERE id = 'confirm-preflight-speaker'").first()).toEqual({ status: "confirmed" });
		expect(await env.DB.prepare("SELECT template_key FROM speaker_tasks WHERE submission_id = 'confirm-preflight-submission'").all()).toMatchObject({ results: [{ template_key: "bio" }] });
	});

	it("hides system forms from organizer lists and public form loading even when opened", async () => {
		await env.DB.batch([
			env.DB.prepare("INSERT INTO events (id, slug, name, timezone, created_at, updated_at) VALUES ('hidden-form-event', 'hidden-form-event', 'Hidden forms', 'UTC', ?, ?)").bind(now, now),
			env.DB.prepare("INSERT INTO cfp_forms (id, event_id, slug, title, status, kind, created_at, updated_at) VALUES ('hidden-public-form', 'hidden-form-event', 'cfp', 'Public CFP', 'open', 'public', ?, ?)").bind(now, now),
			env.DB.prepare("INSERT INTO cfp_forms (id, event_id, slug, title, status, kind, created_at, updated_at) VALUES ('hidden-system-form', 'hidden-form-event', ?, 'System', 'open', 'system', ?, ?)").bind(SYSTEM_CFP_FORM_SLUG, now, now),
		]);

		expect((await listFormsForEvent(env.DB, "hidden-form-event")).map((form) => form.slug)).toEqual(["cfp"]);
		expect(await getOpenForm(env.DB, "hidden-form-event", SYSTEM_CFP_FORM_SLUG)).toBeNull();
		expect(await loadCfpForm(env.DB, "hidden-form-event", SYSTEM_CFP_FORM_SLUG)).toBeNull();
		expect(await loadCfpForm(env.DB, "hidden-form-event", SYSTEM_CFP_FORM_SLUG, { requireOpen: true })).toBeNull();
		expect(await loadCfpForm(env.DB, "hidden-form-event", "cfp", { requireOpen: true })).not.toBeNull();
	});
});
