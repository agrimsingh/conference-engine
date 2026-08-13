import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { fieldLabelsForSubmission, publishFormRevision } from "@/lib/cfp/form-revisions";
import { loadCfpForm } from "@/lib/cfp/load-form";
import { getFormBySlug, listSubmissionsForPerson, listTasksForPerson } from "@/lib/db/queries";
import { acknowledgeAgendaSlotForActor, listPendingSlotAcksForEvent, slotAckStateForActor } from "@/lib/schedule/slot-ack";
import { completeTextTask } from "@/lib/speakers/complete-task";
import { acceptSpeakerHandoff, canActAsSpeaker, getHandoffByToken, requestSpeakerHandoff } from "@/lib/speakers/handoff";
import { previewSpeakerRosterCsv } from "@/lib/speakers/roster";

const now = 1_780_800_000_000;

describe("program ops gaps", () => {
	it("previews speaker roster CSV without writing profiles", async () => {
		await env.DB.batch([
			env.DB.prepare(
				"INSERT INTO events (id, slug, name, timezone, created_at, updated_at) VALUES ('pog-roster', 'pog-roster', 'Roster preview', 'UTC', ?, ?)",
			).bind(now, now),
		]);
		const preview = await previewSpeakerRosterCsv(env.DB, {
			eventId: "pog-roster",
			csv: "email,name\npreview@example.test,Preview Person\n",
		});
		expect(preview.ok).toBe(true);
		if (!preview.ok) return;
		expect(preview.created).toBe(1);
		expect(
			(await env.DB.prepare("SELECT COUNT(*) AS count FROM event_speaker_profiles WHERE event_id = 'pog-roster'").first<{ count: number }>())
				?.count,
		).toBe(0);
	});

	it("freezes public CFP labels on the published revision", async () => {
		await env.DB.batch([
			env.DB.prepare(
				"INSERT INTO events (id, slug, name, timezone, created_at, updated_at) VALUES ('pog-form', 'pog-form', 'Form freeze', 'UTC', ?, ?)",
			).bind(now, now),
			env.DB.prepare(
				"INSERT INTO cfp_forms (id, event_id, slug, title, status, created_at, updated_at) VALUES ('pog-form-cfp', 'pog-form', 'cfp', 'CFP', 'open', ?, ?)",
			).bind(now, now),
			env.DB.prepare(
				`INSERT INTO form_fields (id, form_id, key, label, field_type, required, position, visibility_rule, config, soft_deleted)
				 VALUES ('pog-form-title', 'pog-form-cfp', 'title', 'Title', 'text', 1, 0, '{"op":"always"}', '{"kind":"text"}', 0)`,
			),
		]);
		const form = await getFormBySlug(env.DB, "pog-form", "cfp");
		expect(form).not.toBeNull();
		const published = await publishFormRevision(env.DB, { form: form!, now });
		await env.DB.prepare("UPDATE form_fields SET label = 'Session title' WHERE id = 'pog-form-title'").run();
		const loaded = await loadCfpForm(env.DB, "pog-form", "cfp");
		expect(loaded?.fields.find((field) => field.key === "title")?.label).toBe("Title");
		await env.DB.prepare(
			`INSERT INTO submissions (id, form_id, event_id, status, answers_json, form_revision_id, created_at, updated_at)
			 VALUES ('pog-form-sub', 'pog-form-cfp', 'pog-form', 'submitted', '{"title":"Talk"}', ?, ?, ?)`,
		).bind(published.id, now, now).run();
		const labels = await fieldLabelsForSubmission(env.DB, {
			form_id: "pog-form-cfp",
			form_revision_id: published.id,
		});
		expect(labels.get("title")).toBe("Title");
	});

	it("lets an accepted manager see the session and complete speaker tasks", async () => {
		await env.DB.batch([
			env.DB.prepare(
				"INSERT INTO events (id, slug, name, timezone, created_at, updated_at) VALUES ('pog-hand', 'pog-hand', 'Handoff', 'UTC', ?, ?)",
			).bind(now, now),
			env.DB.prepare(
				"INSERT INTO cfp_forms (id, event_id, slug, title, status, created_at, updated_at) VALUES ('pog-hand-form', 'pog-hand', 'cfp', 'CFP', 'open', ?, ?)",
			).bind(now, now),
			env.DB.prepare("INSERT INTO people (id, email, name, created_at) VALUES ('pog-hand-speaker', 'speaker@example.test', 'Speaker', ?)").bind(now),
			env.DB.prepare(
				`INSERT INTO submissions (id, form_id, event_id, status, answers_json, submitter_person_id, created_at, updated_at)
				 VALUES ('pog-hand-sub', 'pog-hand-form', 'pog-hand', 'accepted', '{"title":"Managed talk"}', 'pog-hand-speaker', ?, ?)`,
			).bind(now, now),
			env.DB.prepare(
				`INSERT INTO submission_speakers (id, submission_id, person_id, name, email, bio, position, status, confirmed_at, added_after_acceptance)
				 VALUES ('pog-hand-ss', 'pog-hand-sub', 'pog-hand-speaker', 'Speaker', 'speaker@example.test', NULL, 0, 'confirmed', ?, 0)`,
			).bind(now),
			env.DB.prepare(
				`INSERT INTO speaker_tasks (
					id, event_id, submission_id, person_id, template_key, template_label, template_task_kind, template_required, status, created_at, updated_at
				) VALUES (
					'pog-hand-task', 'pog-hand', 'pog-hand-sub', 'pog-hand-speaker', 'bio', 'Bio', 'text', 1, 'pending', ?, ?
				)`,
			).bind(now, now),
		]);
		const requested = await requestSpeakerHandoff(env.DB, {
			submissionId: "pog-hand-sub",
			speakerPersonId: "pog-hand-speaker",
			managerEmail: "manager@example.test",
			managerName: "Manager",
			origin: "https://conference.example.test",
			runtime: { authSecret: env.AUTH_SECRET },
		});
		expect(requested.ok).toBe(true);
		if (!requested.ok) return;
		const token = decodeURIComponent(new URL(requested.confirmUrl).pathname.split("/").pop() ?? "");
		const byToken = await getHandoffByToken(env.DB, token);
		expect(byToken?.id).toBe(requested.handoffId);
		expect((await acceptSpeakerHandoff(env.DB, requested.handoffId)).ok).toBe(true);
		const manager = await env.DB.prepare("SELECT id FROM people WHERE email = 'manager@example.test'").first<{ id: string }>();
		expect(manager).not.toBeNull();
		expect(await canActAsSpeaker(env.DB, manager!.id, "pog-hand-speaker", "pog-hand-sub")).toBe(true);
		expect((await listSubmissionsForPerson(env.DB, manager!.id)).map((row) => row.id)).toContain("pog-hand-sub");
		expect((await listTasksForPerson(env.DB, manager!.id)).map((row) => row.id)).toContain("pog-hand-task");
		const completed = await completeTextTask(env.DB, {
			taskId: "pog-hand-task",
			personId: manager!.id,
			text: "This is a long enough speaker biography for the portal.",
		});
		expect(completed.ok).toBe(true);
		expect(
			(await env.DB.prepare("SELECT person_id FROM submission_speakers WHERE submission_id = 'pog-hand-sub'").all<{ person_id: string }>())
				.results.map((row) => row.person_id),
		).toEqual(["pog-hand-speaker"]);
	});

	it("requires a portal ack after a schedule move and clears it when confirmed", async () => {
		await env.DB.batch([
			env.DB.prepare(
				"INSERT INTO events (id, slug, name, timezone, created_at, updated_at) VALUES ('pog-ack', 'pog-ack', 'Ack', 'UTC', ?, ?)",
			).bind(now, now),
			env.DB.prepare(
				"INSERT INTO cfp_forms (id, event_id, slug, title, status, created_at, updated_at) VALUES ('pog-ack-form', 'pog-ack', 'cfp', 'CFP', 'open', ?, ?)",
			).bind(now, now),
			env.DB.prepare("INSERT INTO people (id, email, name, created_at) VALUES ('pog-ack-speaker', 'ack@example.test', 'Ack Speaker', ?)").bind(now),
			env.DB.prepare(
				`INSERT INTO submissions (id, form_id, event_id, status, answers_json, submitter_person_id, created_at, updated_at)
				 VALUES ('pog-ack-sub', 'pog-ack-form', 'pog-ack', 'scheduled', '{"title":"Moved talk"}', 'pog-ack-speaker', ?, ?)`,
			).bind(now, now),
			env.DB.prepare(
				`INSERT INTO submission_speakers (id, submission_id, person_id, name, email, bio, position, status, confirmed_at, added_after_acceptance)
				 VALUES ('pog-ack-ss', 'pog-ack-sub', 'pog-ack-speaker', 'Ack Speaker', 'ack@example.test', NULL, 0, 'confirmed', ?, 0)`,
			).bind(now),
			env.DB.prepare(
				`INSERT INTO agenda_slots (id, event_id, submission_id, room_name, starts_at, ends_at, ics_uid, ack_required, created_at, updated_at)
				 VALUES ('pog-ack-slot', 'pog-ack', 'pog-ack-sub', 'Main', ?, ?, 'pog-ack-uid', 1, ?, ?)`,
			).bind(now, now + 3_600_000, now, now),
			env.DB.prepare(
				`INSERT INTO agenda_calendar_lifecycles (event_id, submission_id, ics_uid, sequence, created_at, updated_at)
				 VALUES ('pog-ack', 'pog-ack-sub', 'pog-ack-uid', 2, ?, ?)`,
			).bind(now, now),
		]);
		expect((await slotAckStateForActor(env.DB, { submissionId: "pog-ack-sub", actorPersonId: "pog-ack-speaker" })).needsAck).toBe(true);
		expect(await listPendingSlotAcksForEvent(env.DB, "pog-ack")).toHaveLength(1);
		expect((await acknowledgeAgendaSlotForActor(env.DB, { submissionId: "pog-ack-sub", actorPersonId: "pog-ack-speaker", now })).ok).toBe(true);
		expect((await slotAckStateForActor(env.DB, { submissionId: "pog-ack-sub", actorPersonId: "pog-ack-speaker" })).needsAck).toBe(false);
		expect(await listPendingSlotAcksForEvent(env.DB, "pog-ack")).toHaveLength(0);
	});
});
