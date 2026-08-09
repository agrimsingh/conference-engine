import { env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { addDeliverableComment, createFileRequestForAllSpeakers } from "@/lib/content/deliverables";
import { exportLatestDeliverables } from "@/lib/content/export";
import { restoreSessionRevision, setSessionContentStatus, updateSessionContent } from "@/lib/content/revisions";
import { completeFileTask } from "@/lib/speakers/complete-task";

describe("content deliverables", () => {
	const now = Date.UTC(2027, 3, 1);
	beforeAll(async () => {
		await env.DB.batch([
			env.DB.prepare("INSERT INTO events (id, slug, name, timezone, mode, created_at, updated_at) VALUES ('cnt-event', 'cnt-event', 'Content event', 'UTC', 'live', ?, ?)").bind(now, now),
			env.DB.prepare("INSERT INTO events (id, slug, name, timezone, mode, created_at, updated_at) VALUES ('cnt-foreign', 'cnt-foreign', 'Foreign event', 'UTC', 'live', ?, ?)").bind(now, now),
			env.DB.prepare("INSERT INTO cfp_forms (id, event_id, slug, title, status, created_at, updated_at) VALUES ('cnt-form', 'cnt-event', 'cfp', 'CFP', 'open', ?, ?)").bind(now, now),
			env.DB.prepare("INSERT INTO cfp_forms (id, event_id, slug, title, status, created_at, updated_at) VALUES ('cnt-foreign-form', 'cnt-foreign', 'cfp', 'CFP', 'open', ?, ?)").bind(now, now),
			env.DB.prepare("INSERT INTO people (id, email, name, created_at) VALUES ('cnt-priya', 'priya@example.test', 'Priya Raman', ?)").bind(now),
			env.DB.prepare("INSERT INTO people (id, email, name, created_at) VALUES ('cnt-marcus', 'marcus@example.test', 'Marcus Okafor', ?)").bind(now),
			env.DB.prepare("INSERT INTO submissions (id, form_id, event_id, status, answers_json, content_status, created_at, updated_at) VALUES ('cnt-session', 'cnt-form', 'cnt-event', 'accepted', ?, 'draft', ?, ?)").bind(JSON.stringify({ title: "Taming CI", abstract: "Initial" }), now, now),
			env.DB.prepare("INSERT INTO submissions (id, form_id, event_id, status, answers_json, content_status, created_at, updated_at) VALUES ('cnt-session-2', 'cnt-form', 'cnt-event', 'accepted', ?, 'draft', ?, ?)").bind(JSON.stringify({ title: "Agents", abstract: "Initial" }), now, now),
			env.DB.prepare("INSERT INTO submission_speakers (id, submission_id, person_id, name, email, position, status) VALUES ('cnt-priya-speaker', 'cnt-session', 'cnt-priya', 'Priya Raman', 'priya@example.test', 0, 'confirmed')"),
			env.DB.prepare("INSERT INTO submission_speakers (id, submission_id, person_id, name, email, position, status) VALUES ('cnt-marcus-speaker', 'cnt-session-2', 'cnt-marcus', 'Marcus Okafor', 'marcus@example.test', 0, 'confirmed')"),
			env.DB.prepare("INSERT INTO speaker_profiles (id, event_id, person_id, display_name, created_at, updated_at) VALUES ('cnt-profile-priya', 'cnt-event', 'cnt-priya', 'Priya Raman', ?, ?)").bind(now, now),
			env.DB.prepare("INSERT INTO speaker_profiles (id, event_id, person_id, display_name, created_at, updated_at) VALUES ('cnt-profile-marcus', 'cnt-event', 'cnt-marcus', 'Marcus Okafor', ?, ?)").bind(now, now),
		]);
	});

	it("assigns requests to every accepted speaker and retains both upload versions", async () => {
		const created = await createFileRequestForAllSpeakers(env.DB, { eventId: "cnt-event", label: "Upload Session Presentation", instructions: "Final slide deck as a PDF, 16:9 aspect ratio.", dueAt: Date.UTC(2027, 4, 1) });
		expect(created.assigned).toBe(2);
		const tasks = await env.DB.prepare("SELECT id, person_id FROM speaker_tasks WHERE event_id = 'cnt-event' AND template_label = 'Upload Session Presentation' ORDER BY person_id").all<{ id: string; person_id: string }>();
		const priyaTask = tasks.results.find((row) => row.person_id === "cnt-priya")!;
		expect(await completeFileTask(env.DB, env.FILES, { taskId: priyaTask.id, personId: "cnt-priya", file: new File(["draft"], "slides.pdf", { type: "application/pdf" }) })).toMatchObject({ ok: true });
		expect(await completeFileTask(env.DB, env.FILES, { taskId: priyaTask.id, personId: "cnt-priya", file: new File(["final"], "slides.pdf", { type: "application/pdf" }) })).toMatchObject({ ok: true });
		const versions = await env.DB.prepare("SELECT version_number, asset_id FROM deliverable_versions WHERE task_id = ? ORDER BY version_number").bind(priyaTask.id).all<{ version_number: number; asset_id: string }>();
		expect(versions.results.map((row) => row.version_number)).toEqual([1, 2]);
		expect(new Set(versions.results.map((row) => row.asset_id)).size).toBe(2);
		expect(await env.DB.prepare("SELECT COUNT(*) AS count FROM assets WHERE event_id = 'cnt-event'").first()).toEqual({ count: 2 });
		const comment = await addDeliverableComment(env.DB, { taskId: priyaTask.id, personId: "cnt-priya", authorKind: "speaker", authorPersonId: "cnt-priya", authorName: "Priya Raman", body: "Draft deck - final version coming Friday." });
		expect(comment).toMatchObject({ ok: true });
		expect(await addDeliverableComment(env.DB, { taskId: priyaTask.id, personId: "cnt-marcus", authorKind: "speaker", authorPersonId: "cnt-marcus", authorName: "Marcus", body: "cross access" })).toMatchObject({ ok: false, status: 404 });
		const zip = await exportLatestDeliverables(env.DB, env.FILES, { eventId: "cnt-event", taskIds: [priyaTask.id] });
		expect(zip.ok && new TextDecoder().decode(zip.body)).toContain("slides.pdf");
		expect(await exportLatestDeliverables(env.DB, env.FILES, { eventId: "cnt-foreign", taskIds: [priyaTask.id] })).toMatchObject({ ok: false, status: 404 });
	});

	it("keeps an approved immutable snapshot while drafts and restores advance current history", async () => {
		await updateSessionContent(env.DB, { eventId: "cnt-event", submissionId: "cnt-session", editorAccountId: null, editorName: "Jordan Alvarez", content: { title: "UPDATED: Taming CI", abstract: "Initial. Live demo." } });
		await setSessionContentStatus(env.DB, { eventId: "cnt-event", submissionId: "cnt-session", status: "approved" });
		const approved = await env.DB.prepare("SELECT approved_revision_id FROM content_heads WHERE event_id = 'cnt-event' AND entity_id = 'cnt-session'").first<{ approved_revision_id: string }>();
		await updateSessionContent(env.DB, { eventId: "cnt-event", submissionId: "cnt-session", editorAccountId: null, editorName: "Jordan Alvarez", content: { title: "UPDATED: Taming CI", abstract: "Initial. Live demo. Bring laptop." } });
		const head = await env.DB.prepare("SELECT current_revision_id, approved_revision_id FROM content_heads WHERE event_id = 'cnt-event' AND entity_id = 'cnt-session'").first<{ current_revision_id: string; approved_revision_id: string }>();
		expect(head?.approved_revision_id).toBe(approved?.approved_revision_id);
		expect(head?.current_revision_id).not.toBe(head?.approved_revision_id);
		const old = await env.DB.prepare("SELECT id FROM content_revisions WHERE event_id = 'cnt-event' AND entity_id = 'cnt-session' AND revision_number = 1").first<{ id: string }>();
		expect(await restoreSessionRevision(env.DB, { eventId: "cnt-event", submissionId: "cnt-session", revisionId: old!.id, editorAccountId: null, editorName: "Jordan Alvarez" })).toEqual({ ok: true });
		expect(JSON.parse((await env.DB.prepare("SELECT answers_json FROM submissions WHERE id = 'cnt-session'").first<{ answers_json: string }>())!.answers_json).abstract).toBe("Initial. Live demo.");
	});
});
