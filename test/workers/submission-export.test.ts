import { env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { storeCfpFieldUpload } from "@/lib/cfp/file-upload";
import { exportLatestDeliverables } from "@/lib/content/export";
import { createFileRequestForAllSpeakers } from "@/lib/content/deliverables";
import { exportSubmissionUploads } from "@/lib/export/submission-uploads-zip";
import { loadSubmissionExportRows, submissionsToCsv } from "@/lib/export/submissions-csv";
import { submissionsToXlsx } from "@/lib/export/submissions-xlsx";
import { completeFileTask } from "@/lib/speakers/complete-task";

describe("submission export parity", () => {
	const now = Date.UTC(2027, 5, 1);

	beforeAll(async () => {
		await env.DB.batch([
			env.DB.prepare(
				"INSERT INTO events (id, slug, name, timezone, mode, created_at, updated_at) VALUES ('exp-event', 'exp-event', 'Export event', 'UTC', 'live', ?, ?)",
			).bind(now, now),
			env.DB.prepare(
				"INSERT INTO cfp_forms (id, event_id, slug, title, status, created_at, updated_at) VALUES ('exp-form', 'exp-event', 'cfp', 'CFP', 'open', ?, ?)",
			).bind(now, now),
			env.DB.prepare(
				"INSERT INTO people (id, email, name, created_at) VALUES ('exp-speaker', 'speaker@example.test', 'Export Speaker', ?)",
			).bind(now),
		]);

		const stored = await storeCfpFieldUpload(env.DB, env.FILES, {
			eventId: "exp-event",
			formId: "exp-form",
			fieldKey: "supporting_doc",
			file: new File(["%PDF-cfp-upload"], "proposal-brief.pdf", { type: "application/pdf" }),
			maxBytes: 1024 * 1024,
		});
		expect(stored.ok).toBe(true);
		if (!stored.ok) throw new Error("store failed");

		await env.DB.batch([
			env.DB.prepare(
				`INSERT INTO submissions (id, form_id, event_id, status, answers_json, submitter_email, submitter_name, created_at, updated_at, submitted_at)
				 VALUES ('exp-sub', 'exp-form', 'exp-event', 'submitted', ?, 'ada@example.test', 'Ada', ?, ?, ?)`,
			).bind(
				JSON.stringify({
					title: "Exportable Talk",
					supporting_doc: stored.answer,
				}),
				now,
				now,
				now,
			),
			env.DB.prepare(
				"INSERT INTO submission_speakers (id, submission_id, person_id, name, email, position, status) VALUES ('exp-ss', 'exp-sub', 'exp-speaker', 'Export Speaker', 'speaker@example.test', 0, 'confirmed')",
			),
			env.DB.prepare(
				"INSERT INTO speaker_profiles (id, event_id, person_id, display_name, created_at, updated_at) VALUES ('exp-profile', 'exp-event', 'exp-speaker', 'Export Speaker', ?, ?)",
			).bind(now, now),
		]);
	});

	it("keeps XLSX columns aligned with CSV and zips referenced CFP uploads", async () => {
		const rows = await loadSubmissionExportRows(env.DB, "exp-event");
		expect(rows).toHaveLength(1);
		expect(rows[0]?.title).toBe("Exportable Talk");

		const csv = submissionsToCsv(rows);
		expect(csv).toContain("Exportable Talk");

		const xlsx = submissionsToXlsx(rows);
		const xlsxText = new TextDecoder().decode(xlsx);
		expect(xlsxText).toContain(">Exportable Talk<");
		expect(xlsxText).toContain(">id<");
		expect(xlsxText).toContain(">title<");

		const zip = await exportSubmissionUploads(env.DB, env.FILES, { eventId: "exp-event" });
		expect(zip.ok).toBe(true);
		if (!zip.ok) return;
		expect(zip.count).toBe(1);
		const zipText = new TextDecoder().decode(zip.body);
		expect(zipText).toContain("proposal-brief.pdf");
		expect(zipText).toContain("%PDF-cfp-upload");
	});

	it("does not treat speaker deliverables as the CFP files bundle", async () => {
		await env.DB.prepare(
			"UPDATE submissions SET status = 'accepted' WHERE id = 'exp-sub'",
		).run();
		const created = await createFileRequestForAllSpeakers(env.DB, {
			eventId: "exp-event",
			label: "Upload Session Presentation",
			instructions: "Deck",
			dueAt: Date.UTC(2027, 6, 1),
		});
		expect(created.assigned).toBe(1);
		const task = await env.DB.prepare(
			"SELECT id FROM speaker_tasks WHERE event_id = 'exp-event' AND person_id = 'exp-speaker'",
		).first<{ id: string }>();
		expect(task).toBeTruthy();
		expect(
			await completeFileTask(env.DB, env.FILES, {
				taskId: task!.id,
				personId: "exp-speaker",
				file: new File(["deliverable-bytes"], "slides.pdf", { type: "application/pdf" }),
			}),
		).toMatchObject({ ok: true });

		const deliverables = await exportLatestDeliverables(env.DB, env.FILES, {
			eventId: "exp-event",
			taskIds: [task!.id],
		});
		expect(deliverables.ok).toBe(true);
		if (!deliverables.ok) return;
		expect(new TextDecoder().decode(deliverables.body)).toContain("slides.pdf");

		const cfpZip = await exportSubmissionUploads(env.DB, env.FILES, { eventId: "exp-event" });
		expect(cfpZip.ok).toBe(true);
		if (!cfpZip.ok) return;
		const text = new TextDecoder().decode(cfpZip.body);
		expect(text).toContain("proposal-brief.pdf");
		expect(text).not.toContain("slides.pdf");
		expect(text).not.toContain("deliverable-bytes");
	});
});
