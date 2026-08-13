import { env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import {
	addDeliverableComment,
	listDeliverableBundles,
	resolveDeliverableVersion,
} from "@/lib/content/deliverables";
import { listTasksForPerson } from "@/lib/db/queries";
import { completeTextTask } from "@/lib/speakers/complete-task";
import {
	completeSpeakerActionAssignment,
	listSpeakerActionAssignments,
} from "@/lib/speakers/operations";

describe("manager handoff submission scope", () => {
	const now = Date.UTC(2027, 7, 13);

	beforeAll(async () => {
		await env.DB.batch([
			env.DB.prepare("INSERT INTO events (id, slug, name, timezone, mode, created_at, updated_at) VALUES ('handoff-scope-event', 'handoff-scope-event', 'Handoff scope', 'UTC', 'live', ?, ?)").bind(now, now),
			env.DB.prepare("INSERT INTO events (id, slug, name, timezone, mode, created_at, updated_at) VALUES ('handoff-scope-foreign-event', 'handoff-scope-foreign-event', 'Foreign handoff scope', 'UTC', 'live', ?, ?)").bind(now, now),
			env.DB.prepare("INSERT INTO cfp_forms (id, event_id, slug, title, status, created_at, updated_at) VALUES ('handoff-scope-form', 'handoff-scope-event', 'cfp', 'CFP', 'closed', ?, ?)").bind(now, now),
			env.DB.prepare("INSERT INTO cfp_forms (id, event_id, slug, title, status, created_at, updated_at) VALUES ('handoff-scope-foreign-form', 'handoff-scope-foreign-event', 'cfp', 'CFP', 'closed', ?, ?)").bind(now, now),
			env.DB.prepare("INSERT INTO people (id, email, name, created_at) VALUES ('handoff-scope-speaker', 'speaker@handoff-scope.test', 'Speaker', ?)").bind(now),
			env.DB.prepare("INSERT INTO people (id, email, name, created_at) VALUES ('handoff-scope-manager', 'manager@handoff-scope.test', 'Manager', ?)").bind(now),
			env.DB.prepare("INSERT INTO submissions (id, form_id, event_id, status, answers_json, created_at, updated_at) VALUES ('handoff-scope-a', 'handoff-scope-form', 'handoff-scope-event', 'accepted', '{\"title\":\"Managed session\"}', ?, ?)").bind(now, now),
			env.DB.prepare("INSERT INTO submissions (id, form_id, event_id, status, answers_json, created_at, updated_at) VALUES ('handoff-scope-b', 'handoff-scope-form', 'handoff-scope-event', 'accepted', '{\"title\":\"Unmanaged session\"}', ?, ?)").bind(now, now),
			env.DB.prepare("INSERT INTO submissions (id, form_id, event_id, status, answers_json, created_at, updated_at) VALUES ('handoff-scope-c', 'handoff-scope-foreign-form', 'handoff-scope-foreign-event', 'accepted', '{\"title\":\"Foreign event session\"}', ?, ?)").bind(now, now),
			env.DB.prepare("INSERT INTO submission_speakers (id, submission_id, person_id, name, email, position, status) VALUES ('handoff-scope-speaker-a', 'handoff-scope-a', 'handoff-scope-speaker', 'Speaker', 'speaker@handoff-scope.test', 0, 'confirmed')"),
			env.DB.prepare("INSERT INTO submission_speakers (id, submission_id, person_id, name, email, position, status) VALUES ('handoff-scope-speaker-b', 'handoff-scope-b', 'handoff-scope-speaker', 'Speaker', 'speaker@handoff-scope.test', 0, 'confirmed')"),
			env.DB.prepare("INSERT INTO speaker_handoffs (id, event_id, submission_id, speaker_person_id, manager_email, manager_name, manager_person_id, token_hash, status, created_at, resolved_at) VALUES ('handoff-scope-accepted', 'handoff-scope-event', 'handoff-scope-a', 'handoff-scope-speaker', 'manager@handoff-scope.test', 'Manager', 'handoff-scope-manager', 'handoff-scope-token', 'accepted', ?, ?)").bind(now, now),
			env.DB.prepare("INSERT INTO speaker_tasks (id, event_id, submission_id, person_id, template_key, template_label, template_task_kind, template_required, status, created_at, updated_at) VALUES ('handoff-scope-text-a', 'handoff-scope-event', 'handoff-scope-a', 'handoff-scope-speaker', 'notes-a', 'Session A notes', 'text', 1, 'pending', ?, ?)").bind(now, now),
			env.DB.prepare("INSERT INTO speaker_tasks (id, event_id, submission_id, person_id, template_key, template_label, template_task_kind, template_required, status, created_at, updated_at) VALUES ('handoff-scope-text-b', 'handoff-scope-event', 'handoff-scope-b', 'handoff-scope-speaker', 'notes-b', 'Session B notes', 'text', 1, 'pending', ?, ?)").bind(now, now),
			env.DB.prepare("INSERT INTO speaker_tasks (id, event_id, submission_id, person_id, template_key, template_label, template_task_kind, template_required, status, created_at, updated_at) VALUES ('handoff-scope-text-c', 'handoff-scope-foreign-event', 'handoff-scope-c', 'handoff-scope-speaker', 'notes-c', 'Session C notes', 'text', 1, 'pending', ?, ?)").bind(now, now),
			env.DB.prepare("INSERT INTO speaker_tasks (id, event_id, submission_id, person_id, template_key, template_label, template_task_kind, template_required, status, created_at, updated_at) VALUES ('handoff-scope-file-a', 'handoff-scope-event', 'handoff-scope-a', 'handoff-scope-speaker', 'slides-a', 'Session A slides', 'file', 1, 'completed', ?, ?)").bind(now, now),
			env.DB.prepare("INSERT INTO speaker_tasks (id, event_id, submission_id, person_id, template_key, template_label, template_task_kind, template_required, status, created_at, updated_at) VALUES ('handoff-scope-file-b', 'handoff-scope-event', 'handoff-scope-b', 'handoff-scope-speaker', 'slides-b', 'Session B slides', 'file', 1, 'completed', ?, ?)").bind(now, now),
			env.DB.prepare("INSERT INTO speaker_tasks (id, event_id, submission_id, person_id, template_key, template_label, template_task_kind, template_required, status, created_at, updated_at) VALUES ('handoff-scope-file-c', 'handoff-scope-foreign-event', 'handoff-scope-c', 'handoff-scope-speaker', 'slides-c', 'Session C slides', 'file', 1, 'completed', ?, ?)").bind(now, now),
			env.DB.prepare("INSERT INTO assets (id, event_id, r2_key, content_type, filename, uploaded_by_person_id, created_at) VALUES ('handoff-scope-asset-a', 'handoff-scope-event', 'scope/a.pdf', 'application/pdf', 'a.pdf', 'handoff-scope-speaker', ?)").bind(now),
			env.DB.prepare("INSERT INTO assets (id, event_id, r2_key, content_type, filename, uploaded_by_person_id, created_at) VALUES ('handoff-scope-asset-b', 'handoff-scope-event', 'scope/b.pdf', 'application/pdf', 'b.pdf', 'handoff-scope-speaker', ?)").bind(now),
			env.DB.prepare("INSERT INTO assets (id, event_id, r2_key, content_type, filename, uploaded_by_person_id, created_at) VALUES ('handoff-scope-asset-c', 'handoff-scope-foreign-event', 'scope/c.pdf', 'application/pdf', 'c.pdf', 'handoff-scope-speaker', ?)").bind(now),
			env.DB.prepare("UPDATE speaker_tasks SET asset_id = 'handoff-scope-asset-a' WHERE id = 'handoff-scope-file-a'"),
			env.DB.prepare("UPDATE speaker_tasks SET asset_id = 'handoff-scope-asset-b' WHERE id = 'handoff-scope-file-b'"),
			env.DB.prepare("UPDATE speaker_tasks SET asset_id = 'handoff-scope-asset-c' WHERE id = 'handoff-scope-file-c'"),
			env.DB.prepare("INSERT INTO deliverable_versions (id, event_id, task_id, asset_id, version_number, uploaded_by_person_id, size_bytes, created_at) VALUES ('handoff-scope-version-a', 'handoff-scope-event', 'handoff-scope-file-a', 'handoff-scope-asset-a', 1, 'handoff-scope-speaker', 1, ?)").bind(now),
			env.DB.prepare("INSERT INTO deliverable_versions (id, event_id, task_id, asset_id, version_number, uploaded_by_person_id, size_bytes, created_at) VALUES ('handoff-scope-version-b', 'handoff-scope-event', 'handoff-scope-file-b', 'handoff-scope-asset-b', 1, 'handoff-scope-speaker', 1, ?)").bind(now),
			env.DB.prepare("INSERT INTO deliverable_versions (id, event_id, task_id, asset_id, version_number, uploaded_by_person_id, size_bytes, created_at) VALUES ('handoff-scope-version-c', 'handoff-scope-foreign-event', 'handoff-scope-file-c', 'handoff-scope-asset-c', 1, 'handoff-scope-speaker', 1, ?)").bind(now),
			env.DB.prepare("INSERT INTO speaker_action_tasks (id, event_id, title, created_at, updated_at) VALUES ('handoff-scope-action', 'handoff-scope-event', 'General speaker action', ?, ?)").bind(now, now),
			env.DB.prepare("INSERT INTO speaker_action_task_assignments (id, event_id, task_id, person_id, status, created_at, updated_at) VALUES ('handoff-scope-assignment', 'handoff-scope-event', 'handoff-scope-action', 'handoff-scope-speaker', 'pending', ?, ?)").bind(now, now),
		]);
	});

	it("lists only tasks and deliverables belonging to the handed-off submission", async () => {
		// Given an accepted handoff for submission A and the same speaker on submission B
		// When the manager opens their portal work
		const tasks = await listTasksForPerson(env.DB, "handoff-scope-manager");
		const bundles = await listDeliverableBundles(env.DB, { personId: "handoff-scope-manager" });

		// Then only submission A work is visible
		expect(tasks.map((task) => task.id).sort()).toEqual(["handoff-scope-file-a", "handoff-scope-text-a"]);
		expect([...bundles.keys()]).toEqual(["handoff-scope-file-a"]);
	});

	it("reads only deliverable versions belonging to the handed-off submission", async () => {
		// Given deliverables for submissions A and B
		// When the manager resolves both download versions
		const managed = await resolveDeliverableVersion(env.DB, { versionId: "handoff-scope-version-a", personId: "handoff-scope-manager" });
		const unrelated = await resolveDeliverableVersion(env.DB, { versionId: "handoff-scope-version-b", personId: "handoff-scope-manager" });

		// Then A resolves and B stays hidden
		expect(managed?.asset.id).toBe("handoff-scope-asset-a");
		expect(unrelated).toBeNull();
	});

	it("denies task and deliverable access for the same speaker in another event", async () => {
		// Given the handed-off speaker also has work in a foreign event
		// When the manager reads and mutates that foreign work
		const foreignVersion = await resolveDeliverableVersion(env.DB, { versionId: "handoff-scope-version-c", personId: "handoff-scope-manager" });
		const foreignTask = await completeTextTask(env.DB, { taskId: "handoff-scope-text-c", personId: "handoff-scope-manager", text: "Cross-event response" });
		const foreignComment = await addDeliverableComment(env.DB, { taskId: "handoff-scope-file-c", personId: "handoff-scope-manager", authorKind: "speaker", authorPersonId: "handoff-scope-manager", authorName: "Manager", body: "Cross-event comment" });

		// Then every foreign-event access path is denied
		expect(foreignVersion).toBeNull();
		expect(foreignTask).toMatchObject({ ok: false, status: 403 });
		expect(foreignComment).toMatchObject({ ok: false, status: 404 });
	});

	it("mutates only tasks and deliverables belonging to the handed-off submission", async () => {
		// Given mutable text tasks and uploaded deliverables for submissions A and B
		// When the manager attempts the same operations on both submissions
		const managedTask = await completeTextTask(env.DB, { taskId: "handoff-scope-text-a", personId: "handoff-scope-manager", text: "Manager response for A" });
		const unrelatedTask = await completeTextTask(env.DB, { taskId: "handoff-scope-text-b", personId: "handoff-scope-manager", text: "Manager response for B" });
		const managedComment = await addDeliverableComment(env.DB, { taskId: "handoff-scope-file-a", personId: "handoff-scope-manager", authorKind: "speaker", authorPersonId: "handoff-scope-manager", authorName: "Manager", body: "Allowed on A" });
		const unrelatedComment = await addDeliverableComment(env.DB, { taskId: "handoff-scope-file-b", personId: "handoff-scope-manager", authorKind: "speaker", authorPersonId: "handoff-scope-manager", authorName: "Manager", body: "Blocked on B" });

		// Then A changes succeed and B changes are denied
		expect(managedTask).toMatchObject({ ok: true });
		expect(unrelatedTask).toMatchObject({ ok: false, status: 403 });
		expect(managedComment).toMatchObject({ ok: true });
		expect(unrelatedComment).toMatchObject({ ok: false, status: 404 });
	});

	it("does not delegate submission-less action assignments through a session handoff", async () => {
		// Given a general event-level action assignment with no submission scope
		// When a session manager lists and completes the speaker's assignment
		const assignments = await listSpeakerActionAssignments(env.DB, { personId: "handoff-scope-manager" });
		const completed = await completeSpeakerActionAssignment(env.DB, { assignmentId: "handoff-scope-assignment", personId: "handoff-scope-manager", now });

		// Then the session handoff grants no access to that unscoped assignment
		expect(assignments).toEqual([]);
		expect(completed).toMatchObject({ ok: false, status: 403 });
	});
});
