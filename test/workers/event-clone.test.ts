import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { SYSTEM_CFP_FORM_SLUG, createEventWithDefaults } from "@/lib/events/create-event";
import { cloneEventConfiguration } from "@/lib/events/clone-event";
import { loadEventConfiguration } from "@/lib/events/configuration";
import { upsertEventMessageTemplate } from "@/lib/email/templates";
import type { AccountRow } from "@/lib/db/types";

const now = 1_780_200_000_000;

const owner: AccountRow = {
	id: "clone-owner",
	email: "clone-owner@test.invalid",
	name: "Clone owner",
	created_at: now,
	updated_at: now,
};

describe("event configuration clone", () => {
	it("copies forms, criteria, tasks, rooms, tracks, and templates without people or submissions", async () => {
		await env.DB.prepare(
			"INSERT INTO accounts (id, email, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
		).bind(owner.id, owner.email, owner.name, now, now).run();

		const source = await createEventWithDefaults(
			env.DB,
			{
				name: "Source conference",
				slug: "source-conference",
				timezone: "Asia/Singapore",
				startDay: "2026-09-01",
				endDay: "2026-09-02",
				preset: "conference",
			},
			owner,
		);

		await upsertEventMessageTemplate(env.DB, {
			eventId: source.eventId,
			templateKey: "acceptance",
			subject: "Accepted at {{event_name}}",
			text: "Hi {{submitter_name}}, {{title}} is in.",
		});

		const publicForm = await env.DB.prepare(
			"SELECT id FROM cfp_forms WHERE event_id = ? AND kind = 'public'",
		).bind(source.eventId).first<{ id: string }>();
		expect(publicForm).toBeTruthy();

		await env.DB.batch([
			env.DB.prepare(
				`INSERT INTO submissions (id, form_id, event_id, status, answers_json, created_at, updated_at)
				 VALUES ('source-submission', ?, ?, 'submitted', '{}', ?, ?)`,
			).bind(publicForm!.id, source.eventId, now, now),
			env.DB.prepare(
				`INSERT INTO people (id, email, name, created_at)
				 VALUES ('source-person', 'speaker@source.test', 'Source Speaker', ?)`,
			).bind(now),
		]);

		const cloned = await cloneEventConfiguration(
			env.DB,
			source.eventId,
			{
				name: "Cloned conference",
				slug: "cloned-conference",
				timezone: "UTC",
				startDay: "2027-01-10",
				endDay: "2027-01-11",
			},
			owner,
		);

		expect(cloned.slug).toBe("cloned-conference");
		expect(cloned.eventId).not.toBe(source.eventId);

		const configuration = await loadEventConfiguration(env.DB, cloned.eventId);
		expect(configuration.event).toMatchObject({
			name: "Cloned conference",
			timezone: "UTC",
			start_day: "2027-01-10",
			end_day: "2027-01-11",
		});
		expect(configuration.rooms.map((room) => room.name).sort()).toEqual(["Main Stage", "Room B"]);
		expect(configuration.tracks).toMatchObject([{ name: "General", slug: "general" }]);
		expect(configuration.tasks.map((task) => task.key)).toEqual(["bio", "headshot", "slides", "docs"]);
		expect(configuration.cfp).toMatchObject({ slug: "cfp", status: "draft", fieldCount: 9 });
		expect(configuration.review).toMatchObject({ criteriaCount: 1 });
		expect(configuration.messageTemplateCount).toBe(1);

		const forms = await env.DB.prepare(
			"SELECT slug, kind, status FROM cfp_forms WHERE event_id = ? ORDER BY kind, slug",
		).bind(cloned.eventId).all<{ slug: string; kind: string; status: string }>();
		expect(forms.results).toEqual([
			{ slug: "cfp", kind: "public", status: "draft" },
			{ slug: SYSTEM_CFP_FORM_SLUG, kind: "system", status: "draft" },
		]);

		const systemCount = await env.DB.prepare(
			"SELECT COUNT(*) AS count FROM cfp_forms WHERE event_id = ? AND kind = 'system'",
		).bind(cloned.eventId).first<{ count: number }>();
		expect(systemCount).toEqual({ count: 1 });

		const taskKeys = await env.DB.prepare(
			"SELECT key FROM task_templates WHERE event_id = ? ORDER BY key",
		).bind(cloned.eventId).all<{ key: string }>();
		expect(taskKeys.results.map((row) => row.key)).toEqual(["bio", "docs", "headshot", "slides"]);

		expect(
			await env.DB.prepare("SELECT COUNT(*) AS count FROM submissions WHERE event_id = ?")
				.bind(cloned.eventId)
				.first(),
		).toEqual({ count: 0 });
		expect(
			await env.DB.prepare("SELECT COUNT(*) AS count FROM speaker_profiles WHERE event_id = ?")
				.bind(cloned.eventId)
				.first(),
		).toEqual({ count: 0 });

		const sourcePlan = await env.DB.prepare(
			"SELECT reviewer_token_digest FROM evaluation_plans WHERE event_id = ?",
		).bind(source.eventId).first<{ reviewer_token_digest: string }>();
		const clonePlan = await env.DB.prepare(
			"SELECT reviewer_token_digest FROM evaluation_plans WHERE event_id = ?",
		).bind(cloned.eventId).first<{ reviewer_token_digest: string }>();
		expect(clonePlan?.reviewer_token_digest).toBeTruthy();
		expect(clonePlan?.reviewer_token_digest).not.toBe(sourcePlan?.reviewer_token_digest);

		const acceptance = await env.DB.prepare(
			"SELECT subject_template FROM event_message_templates WHERE event_id = ? AND template_key = 'acceptance'",
		).bind(cloned.eventId).first<{ subject_template: string }>();
		expect(acceptance).toEqual({ subject_template: "Accepted at {{event_name}}" });
	});

	it("rejects a colliding slug before writing configuration", async () => {
		await env.DB.prepare(
			"INSERT INTO accounts (id, email, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
		).bind("clone-collision-owner", "clone-collision@test.invalid", "Collision", now, now).run();
		const source = await createEventWithDefaults(
			env.DB,
			{
				name: "Collision source",
				slug: "collision-source",
				timezone: "UTC",
				startDay: "2026-09-01",
				endDay: "2026-09-02",
			},
			{ ...owner, id: "clone-collision-owner", email: "clone-collision@test.invalid", name: "Collision" },
		);
		await createEventWithDefaults(
			env.DB,
			{
				name: "Taken slug",
				slug: "taken-slug",
				timezone: "UTC",
				startDay: "2026-09-01",
				endDay: "2026-09-02",
			},
			{ ...owner, id: "clone-collision-owner", email: "clone-collision@test.invalid", name: "Collision" },
		);

		await expect(
			cloneEventConfiguration(
				env.DB,
				source.eventId,
				{
					name: "Should fail",
					slug: "taken-slug",
					startDay: "2026-09-01",
					endDay: "2026-09-02",
				},
				null,
			),
		).rejects.toThrow(/slug already exists/i);
	});
});
