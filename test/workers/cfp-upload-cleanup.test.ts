import { describe, expect, it } from "vitest";
import {
	deleteCfpFieldUpload,
	isCfpAssetReferencedBySubmission,
	storeCfpFieldUpload,
} from "@/lib/cfp/file-upload";
import { authorizeReviewSubmissionAccess } from "@/lib/cfp/review-submission-access";

describe("CFP upload cleanup", () => {
	it("deletes unreferenced uploads and blocks cleanup after submission", async () => {
		const { env } = await import("cloudflare:workers");
		const now = Date.now();
		await env.DB.batch([
			env.DB.prepare("INSERT INTO events (id, slug, name, timezone, created_at, updated_at) VALUES ('cleanup-event', 'cleanup-event', 'Cleanup', 'UTC', ?, ?)").bind(now, now),
			env.DB.prepare("INSERT INTO cfp_forms (id, event_id, slug, title, status, created_at, updated_at) VALUES ('cleanup-form', 'cleanup-event', 'cfp', 'CFP', 'open', ?, ?)").bind(now, now),
		]);
		const file = new File(["%PDF"], "brief.pdf", { type: "application/pdf" });
		const stored = await storeCfpFieldUpload(env.DB, env.FILES, {
			eventId: "cleanup-event",
			formId: "cleanup-form",
			fieldKey: "supporting_doc",
			file,
			maxBytes: 1024 * 1024,
		});
		expect(stored.ok).toBe(true);
		if (!stored.ok) return;

		const deleted = await deleteCfpFieldUpload(env.DB, env.FILES, {
			eventId: "cleanup-event",
			formId: "cleanup-form",
			fieldKey: "supporting_doc",
			assetId: stored.answer.assetId,
		});
		expect(deleted).toEqual({ ok: true });
		const missing = await env.DB.prepare("SELECT id FROM assets WHERE id = ?").bind(stored.answer.assetId).first();
		expect(missing).toBeNull();

		const storedAgain = await storeCfpFieldUpload(env.DB, env.FILES, {
			eventId: "cleanup-event",
			formId: "cleanup-form",
			fieldKey: "supporting_doc",
			file,
			maxBytes: 1024 * 1024,
		});
		expect(storedAgain.ok).toBe(true);
		if (!storedAgain.ok) return;

		await env.DB.prepare(
			`INSERT INTO submissions (id, form_id, event_id, status, answers_json, submitter_email, submitter_name, created_at, updated_at, submitted_at)
			 VALUES ('cleanup-submission', 'cleanup-form', 'cleanup-event', 'submitted', ?, 'ada@example.test', 'Ada', ?, ?, ?)`,
		).bind(JSON.stringify({ supporting_doc: storedAgain.answer }), now, now, now).run();
		expect(await isCfpAssetReferencedBySubmission(env.DB, "cleanup-event", storedAgain.answer.assetId)).toBe(true);

		const blocked = await deleteCfpFieldUpload(env.DB, env.FILES, {
			eventId: "cleanup-event",
			formId: "cleanup-form",
			fieldKey: "supporting_doc",
			assetId: storedAgain.answer.assetId,
		});
		expect(blocked.ok).toBe(false);
		if (blocked.ok) return;
		expect(blocked.status).toBe(409);
	});
});

describe("review submission download auth", () => {
	it("rejects missing tokens for non-admin callers", async () => {
		const { env } = await import("cloudflare:workers");
		const now = Date.now();
		await env.DB.batch([
			env.DB.prepare("INSERT INTO events (id, slug, name, timezone, created_at, updated_at) VALUES ('auth-event', 'auth-event', 'Auth', 'UTC', ?, ?)").bind(now, now),
			env.DB.prepare("INSERT INTO cfp_forms (id, event_id, slug, title, status, created_at, updated_at) VALUES ('auth-form', 'auth-event', 'cfp', 'CFP', 'open', ?, ?)").bind(now, now),
			env.DB.prepare(
				`INSERT INTO submissions (id, form_id, event_id, status, answers_json, submitter_email, submitter_name, created_at, updated_at, submitted_at)
				 VALUES ('auth-submission', 'auth-form', 'auth-event', 'submitted', '{}', 'ada@example.test', 'Ada', ?, ?, ?)`,
			).bind(now, now, now),
		]);

		const result = await authorizeReviewSubmissionAccess(env.DB, {
			token: "",
			submissionId: "auth-submission",
		});
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.status).toBe(401);
	});
});
