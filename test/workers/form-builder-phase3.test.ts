import { describe, expect, it } from "vitest";
import { countFormSubmissions, insertFormField, updateFormField, validateFieldWrite } from "@/lib/cfp/form-admin";
import { storeCfpFieldUpload, verifyCfpFieldUpload } from "@/lib/cfp/file-upload";
import { validateSubmissionAnswersWithAssets } from "@/lib/cfp/submit";
import { serializeFormSections, type FormFieldDef } from "@/lib/domain";

describe("form-admin key editing rules", () => {
	it("accepts file_upload field writes", () => {
		const parsed = validateFieldWrite({
			key: "supporting_doc",
			label: "Supporting document",
			fieldType: "file_upload",
			required: false,
			position: 3,
			visibilityRule: { op: "always" },
			config: { kind: "file_upload", accept: ["application/pdf"], maxBytes: 5 * 1024 * 1024 },
			sectionKey: "extras",
		});
		expect(parsed).not.toBeTypeOf("string");
	});
});

describe("form builder phase 3 workers", () => {
	it("stores and verifies CFP uploads against form field keys", async () => {
		const { env } = await import("cloudflare:workers");
		const now = Date.now();
		await env.DB.batch([
			env.DB.prepare("INSERT INTO events (id, slug, name, timezone, created_at, updated_at) VALUES ('fb-event', 'fb-event', 'FB Event', 'UTC', ?, ?)").bind(now, now),
			env.DB.prepare("INSERT INTO cfp_forms (id, event_id, slug, title, status, sections_json, created_at, updated_at) VALUES ('fb-form', 'fb-event', 'cfp', 'CFP', 'open', ?, ?, ?)")
				.bind(serializeFormSections([{ key: "files", title: "Files" }]), now, now),
			env.DB.prepare("INSERT INTO form_fields (id, form_id, key, label, field_type, required, position, visibility_rule, config, soft_deleted, section_key) VALUES ('fb-upload', 'fb-form', 'deck', 'Deck', 'file_upload', 1, 0, '{\"op\":\"always\"}', '{\"kind\":\"file_upload\",\"accept\":[\"application/pdf\"],\"maxBytes\":1048576}', 0, 'files')"),
			env.DB.prepare("INSERT INTO form_fields (id, form_id, key, label, field_type, required, position, visibility_rule, config, soft_deleted) VALUES ('fb-speakers', 'fb-form', 'speakers', 'Speakers', 'speaker_block', 1, 1, '{\"op\":\"always\"}', '{\"kind\":\"speaker_block\",\"minSpeakers\":1,\"maxSpeakers\":1}', 0)"),
		]);

		const file = new File(["%PDF-1.4"], "deck.pdf", { type: "application/pdf" });
		const stored = await storeCfpFieldUpload(env.DB, env.FILES, {
			eventId: "fb-event",
			formId: "fb-form",
			fieldKey: "deck",
			file,
			maxBytes: 1024 * 1024,
			allowedContentTypes: ["application/pdf"],
		});
		expect(stored.ok).toBe(true);
		if (!stored.ok) return;

		const fields: FormFieldDef[] = [
			{
				key: "deck",
				label: "Deck",
				fieldType: "file_upload",
				required: true,
				position: 0,
				visibilityRule: { op: "always" },
				config: { kind: "file_upload", accept: ["application/pdf"], maxBytes: 1024 * 1024 },
				sectionKey: "files",
			},
			{
				key: "speakers",
				label: "Speakers",
				fieldType: "speaker_block",
				required: true,
				position: 1,
				visibilityRule: { op: "always" },
				config: { kind: "speaker_block", minSpeakers: 1, maxSpeakers: 1 },
			},
		];
		const validated = await validateSubmissionAnswersWithAssets(env.DB, {
			eventId: "fb-event",
			formId: "fb-form",
			fields,
			answers: {
				deck: stored.answer,
				speakers: [{ name: "Ada", email: "ada@example.test" }],
			},
		});
		expect(validated.ok).toBe(true);

		const verified = await verifyCfpFieldUpload(env.DB, {
			eventId: "fb-event",
			formId: "fb-form",
			fieldKey: "deck",
			answer: { assetId: "missing", filename: "deck.pdf" },
		});
		expect(verified).toMatch(/not found/i);
	});

	it("allows key rename before submissions and blocks it afterward", async () => {
		const { env } = await import("cloudflare:workers");
		const now = Date.now();
		await env.DB.batch([
			env.DB.prepare("INSERT INTO events (id, slug, name, timezone, created_at, updated_at) VALUES ('key-event', 'key-event', 'Key Event', 'UTC', ?, ?)").bind(now, now),
			env.DB.prepare("INSERT INTO cfp_forms (id, event_id, slug, title, status, created_at, updated_at) VALUES ('key-form', 'key-event', 'cfp', 'CFP', 'open', ?, ?)").bind(now, now),
		]);
		const row = await insertFormField(env.DB, "key-form", {
			key: "title_old",
			label: "Title",
			fieldType: "text",
			required: true,
			position: 0,
			visibilityRule: { op: "always" },
			config: { kind: "text" },
		});
		const updated = await updateFormField(env.DB, "key-form", row.id, {
			key: "title",
			label: "Title",
			fieldType: "text",
			required: true,
			position: 0,
			visibilityRule: { op: "always" },
			config: { kind: "text" },
		});
		expect(updated.key).toBe("title");

		expect(await countFormSubmissions(env.DB, "key-form")).toBe(0);
		await env.DB.prepare("INSERT INTO submissions (id, form_id, event_id, status, answers_json, submitter_email, submitter_name, created_at, updated_at, submitted_at) VALUES ('sub-1', 'key-form', 'key-event', 'submitted', '{}', 'a@example.test', 'A', ?, ?, ?)").bind(now, now, now).run();
		await expect(updateFormField(env.DB, "key-form", row.id, {
			key: "renamed",
			label: "Title",
			fieldType: "text",
			required: true,
			position: 0,
			visibilityRule: { op: "always" },
			config: { kind: "text" },
		})).rejects.toThrow(/immutable/i);
	});
});
