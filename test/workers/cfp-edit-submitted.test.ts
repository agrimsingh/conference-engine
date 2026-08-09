import { env } from "cloudflare:workers";
import { describe, expect, it, vi } from "vitest";
import { finalizeDraft, prepareDraftResumeDelivery, saveDraftForResume, SubmissionNotEditableError } from "@/lib/cfp/drafts";

vi.mock("@/lib/db/cloudflare", () => ({
	getDb: async () => env.DB,
	getAuthSecret: async () => "cfp-edit-submitted-secret",
}));

import { POST as finalizeDraftRoute } from "@/app/api/e/[eventSlug]/submit/[formSlug]/draft/finalize/route";
import { PUT as saveDraft } from "@/app/api/e/[eventSlug]/submit/[formSlug]/draft/save/route";

const now = Date.now();
const secret = "cfp-edit-submitted-secret";

function jsonRequest(url: string, method: "PUT" | "POST", body: Record<string, unknown>): Request {
	return new Request(url, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
}

async function seedOpenForm(args: {
	eventId: string;
	eventSlug: string;
	formId: string;
	status?: "open" | "closed" | "archived";
	closesAt?: number | null;
}): Promise<void> {
	await env.DB.batch([
		env.DB.prepare("INSERT INTO events (id, slug, name, timezone, created_at, updated_at) VALUES (?, ?, ?, 'UTC', ?, ?)").bind(args.eventId, args.eventSlug, args.eventSlug, now, now),
		env.DB.prepare("INSERT INTO cfp_forms (id, event_id, slug, title, status, drafts_enabled, closes_at, created_at, updated_at) VALUES (?, ?, 'cfp', 'CFP', ?, 1, ?, ?, ?)").bind(args.formId, args.eventId, args.status ?? "open", args.closesAt ?? null, now, now),
		env.DB.prepare("INSERT INTO form_fields (id, form_id, key, label, field_type, required, position, visibility_rule, config) VALUES (?, ?, 'title', 'Title', 'text', 1, 0, '{\"op\":\"always\"}', '{\"kind\":\"text\"}')").bind(`${args.formId}-title`, args.formId),
		env.DB.prepare("INSERT INTO form_fields (id, form_id, key, label, field_type, required, position, visibility_rule, config) VALUES (?, ?, 'speakers', 'Speakers', 'speaker_block', 1, 1, '{\"op\":\"always\"}', '{\"kind\":\"speaker_block\",\"minSpeakers\":1,\"maxSpeakers\":3}')").bind(`${args.formId}-speakers`, args.formId),
	]);
}

describe("submitted proposal editing", () => {
	it("keeps a finalize token editable and updates the same submission while open", async () => {
		const eventId = "edit-open-event";
		const formId = "edit-open-form";
		const draftId = "edit-open-draft";
		const token = "edit-open-token";
		await seedOpenForm({ eventId, eventSlug: "edit-open", formId });
		await prepareDraftResumeDelivery(env.DB, {
			secret, eventId, formId, verifiedEmail: "speaker@edit.open", submitterName: "Ada", draftId, token, now,
			answers: { title: "Original", speakers: [{ name: "Ada", email: "speaker@edit.open" }] },
		});
		const first = await finalizeDraft(env.DB, {
			secret, draftId, token, submitterName: "Ada",
			answers: { title: "Original", speakers: [{ name: "Ada", email: "speaker@edit.open" }] },
			speakers: [{ name: "Ada", email: "speaker@edit.open" }],
			now: now + 1,
		});
		expect(first.replay).toBe(false);
		expect(first.editToken).toBeTruthy();

		const saved = await saveDraftForResume(env.DB, {
			secret, token: first.editToken, submitterName: "Ada Lovelace",
			answers: { title: "Revised title", speakers: [{ name: "Ada Lovelace", email: "speaker@edit.open" }] },
			now: now + 2,
		});
		expect(saved?.draftId).toBe(draftId);
		expect(saved?.token).toBeTruthy();

		const submission = await env.DB.prepare("SELECT id, status, answers_json, submitter_name FROM submissions WHERE id = ?").bind(first.submissionId).first<{ id: string; status: string; answers_json: string; submitter_name: string }>();
		expect(submission).toMatchObject({ id: first.submissionId, status: "submitted", submitter_name: "Ada Lovelace" });
		expect(JSON.parse(submission?.answers_json ?? "{}")).toMatchObject({ title: "Revised title" });

		const updated = await finalizeDraft(env.DB, {
			secret, draftId, token: saved!.token, submitterName: "Ada Lovelace",
			answers: { title: "Final title", speakers: [{ name: "Ada Lovelace", email: "speaker@edit.open" }] },
			speakers: [{ name: "Ada Lovelace", email: "speaker@edit.open" }],
			now: now + 3,
		});
		expect(updated).toMatchObject({ submissionId: first.submissionId, replay: false });
		expect(updated.editToken).toBeTruthy();
		expect(await env.DB.prepare("SELECT COUNT(*) AS count FROM submissions WHERE form_id = ?").bind(formId).first()).toEqual({ count: 1 });
		expect(JSON.parse((await env.DB.prepare("SELECT answers_json FROM submissions WHERE id = ?").bind(first.submissionId).first<{ answers_json: string }>())?.answers_json ?? "{}")).toMatchObject({ title: "Final title" });
	});

	it("rejects save and finalize edits when the form is closed", async () => {
		const eventId = "edit-closed-event";
		const formId = "edit-closed-form";
		const draftId = "edit-closed-draft";
		const token = "edit-closed-token";
		await seedOpenForm({ eventId, eventSlug: "edit-closed", formId, status: "open" });
		await prepareDraftResumeDelivery(env.DB, {
			secret, eventId, formId, verifiedEmail: "speaker@edit.closed", submitterName: "Bea", draftId, token, now,
			answers: { title: "Keep", speakers: [{ name: "Bea", email: "speaker@edit.closed" }] },
		});
		const finalized = await finalizeDraft(env.DB, {
			secret, draftId, token, submitterName: "Bea",
			answers: { title: "Keep", speakers: [{ name: "Bea", email: "speaker@edit.closed" }] },
			speakers: [{ name: "Bea", email: "speaker@edit.closed" }],
			now: now + 1,
		});
		await env.DB.prepare("UPDATE cfp_forms SET status = 'closed', updated_at = ? WHERE id = ?").bind(now + 2, formId).run();

		const context = { params: Promise.resolve({ eventSlug: "edit-closed", formSlug: "cfp" }) };
		const before = await env.DB.prepare("SELECT answers_json, submitter_name FROM submissions WHERE id = ?").bind(finalized.submissionId).first();
		expect((await saveDraft(jsonRequest("https://conference.example.test/api/e/edit-closed/submit/cfp/draft/save", "PUT", {
			token: finalized.editToken, submitterName: "Changed", answers: { title: "Should not save" },
		}), context)).status).toBe(404);
		expect((await finalizeDraftRoute(jsonRequest("https://conference.example.test/api/e/edit-closed/submit/cfp/draft/finalize", "POST", {
			token: finalized.editToken, submitterName: "Changed",
			answers: { title: "Should not save", speakers: [{ name: "Changed", email: "speaker@edit.closed" }] },
		}), context)).status).toBe(404);
		expect(await env.DB.prepare("SELECT answers_json, submitter_name FROM submissions WHERE id = ?").bind(finalized.submissionId).first()).toEqual(before);
	});

	it("rejects in-place edits after the submission leaves submitted", async () => {
		const eventId = "edit-locked-event";
		const formId = "edit-locked-form";
		const draftId = "edit-locked-draft";
		const token = "edit-locked-token";
		await seedOpenForm({ eventId, eventSlug: "edit-locked", formId });
		await prepareDraftResumeDelivery(env.DB, {
			secret, eventId, formId, verifiedEmail: "speaker@edit.locked", submitterName: "Cy", draftId, token, now,
			answers: { title: "Locked", speakers: [{ name: "Cy", email: "speaker@edit.locked" }] },
		});
		const finalized = await finalizeDraft(env.DB, {
			secret, draftId, token, submitterName: "Cy",
			answers: { title: "Locked", speakers: [{ name: "Cy", email: "speaker@edit.locked" }] },
			speakers: [{ name: "Cy", email: "speaker@edit.locked" }],
			now: now + 1,
		});
		await env.DB.prepare("UPDATE submissions SET status = 'under_review', updated_at = ? WHERE id = ?").bind(now + 2, finalized.submissionId).run();
		await expect(saveDraftForResume(env.DB, {
			secret, token: finalized.editToken, submitterName: "Cy",
			answers: { title: "Nope" }, now: now + 3,
		})).rejects.toBeInstanceOf(SubmissionNotEditableError);
		await expect(finalizeDraft(env.DB, {
			secret, draftId, token: finalized.editToken, submitterName: "Cy",
			answers: { title: "Nope", speakers: [{ name: "Cy", email: "speaker@edit.locked" }] },
			speakers: [{ name: "Cy", email: "speaker@edit.locked" }],
			now: now + 4,
		})).rejects.toBeInstanceOf(SubmissionNotEditableError);
	});
});
