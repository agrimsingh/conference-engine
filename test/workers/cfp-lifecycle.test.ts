import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { finalizeDraft, prepareDraftResumeDelivery } from "@/lib/cfp/drafts";
import { loadCfpForm } from "@/lib/cfp/load-form";
import { insertSubmission, validateSubmissionAnswers } from "@/lib/cfp/submit";
import { getOpenForm } from "@/lib/db/queries";
import { resolveSubmissionCategory, validateFieldAnswer, type FormFieldDef } from "@/lib/domain";

const createdAt = 1_780_200_000_000;

async function seedEventAndForm(args: {
	eventId: string;
	slug: string;
	formId: string;
	formSlug?: string;
	opensAt?: number | null;
	closesAt?: number | null;
	limit?: number;
	mode?: "live" | "demo";
	routing?: string | null;
}): Promise<void> {
	await env.DB.batch([
		env.DB.prepare("INSERT INTO events (id, slug, name, timezone, mode, created_at, updated_at) VALUES (?, ?, ?, 'UTC', ?, ?, ?)").bind(args.eventId, args.slug, args.slug, args.mode ?? "live", createdAt, createdAt),
		env.DB.prepare("INSERT INTO cfp_forms (id, event_id, slug, title, status, opens_at, closes_at, submission_limit, category_routing_json, created_at, updated_at) VALUES (?, ?, ?, 'CFP', 'open', ?, ?, ?, ?, ?, ?)")
			.bind(args.formId, args.eventId, args.formSlug ?? "cfp", args.opensAt ?? null, args.closesAt ?? null, args.limit ?? 0, args.routing ?? null, createdAt, createdAt),
	]);
}

describe("CFP lifecycle", () => {
	it("does not expose a form before opens_at and loads its data-configured route once open", async () => {
		const future = Date.now() + 60_000;
		await seedEventAndForm({ eventId: "cfp-future-event", slug: "cfp-future", formId: "cfp-future-form", opensAt: future });
		expect(await getOpenForm(env.DB, "cfp-future-event", "cfp")).toBeNull();

		await seedEventAndForm({
			eventId: "cfp-routed-event", slug: "cfp-routed", formId: "cfp-routed-form",
			routing: '{"fieldKey":"format","map":{"lab":"Lab"}}',
		});
		await env.DB.prepare("INSERT INTO form_fields (id, form_id, key, label, field_type, required, position, visibility_rule, config) VALUES ('cfp-routed-format', 'cfp-routed-form', 'format', 'Format', 'select', 1, 0, '{\"op\":\"always\"}', '{\"kind\":\"select\",\"options\":[{\"value\":\"lab\",\"label\":\"Lab\"}]}')").run();
		const loaded = await loadCfpForm(env.DB, "cfp-routed", "cfp", { requireOpen: true });
		expect(resolveSubmissionCategory(loaded?.categoryRoute ?? null, { format: "lab" })).toBe("Lab");
	});

	it("applies in-visibility and hosted-video validation to final answers", () => {
		const fields: FormFieldDef[] = [
			{ key: "format", label: "Format", fieldType: "select", required: true, position: 0, visibilityRule: { op: "always" }, config: { kind: "select", options: [{ value: "video", label: "Video" }] } },
			{ key: "video", label: "Video", fieldType: "video", required: true, position: 1, visibilityRule: { op: "in", fieldKey: "format", values: ["video"] }, config: { kind: "video" } },
			{ key: "speakers", label: "Speakers", fieldType: "speaker_block", required: true, position: 2, visibilityRule: { op: "always" }, config: { kind: "speaker_block", minSpeakers: 1, maxSpeakers: 1 } },
		];
		expect(validateSubmissionAnswers(fields, { format: "video", video: "https://example.test/proposal", speakers: [{ name: "Ada", email: "ada@example.test" }] }).ok).toBe(true);
		expect(validateFieldAnswer(fields[1]!, "file:///proposal.mp4")).toMatch(/http\(s\)/);
	});

	it("enforces the same D1 submission cap for direct and draft-finalized proposals", async () => {
		await seedEventAndForm({ eventId: "cfp-limit-event", slug: "cfp-limit", formId: "cfp-limit-form", limit: 1 });
		await insertSubmission(env.DB, {
			eventId: "cfp-limit-event", formId: "cfp-limit-form", submitterEmail: "one@example.test", submitterName: "One", answers: {}, speakers: [{ name: "One", email: "one@example.test" }],
		});
		await expect(insertSubmission(env.DB, {
			eventId: "cfp-limit-event", formId: "cfp-limit-form", submitterEmail: "two@example.test", submitterName: "Two", answers: {}, speakers: [{ name: "Two", email: "two@example.test" }],
		})).rejects.toThrow(/submission limit reached/i);

		await prepareDraftResumeDelivery(env.DB, {
			secret: "cfp-lifecycle-secret", eventId: "cfp-limit-event", formId: "cfp-limit-form", verifiedEmail: "draft@example.test", submitterName: "Draft", draftId: "cfp-limit-draft", token: "cfp-limit-token", now: createdAt,
		});
		await expect(finalizeDraft(env.DB, {
			secret: "cfp-lifecycle-secret", draftId: "cfp-limit-draft", token: "cfp-limit-token", submitterName: "Draft", answers: {}, speakers: [{ name: "Draft", email: "draft@example.test" }], now: createdAt + 1,
		})).rejects.toThrow(/submission limit reached/i);
	});

	it("allows only one concurrent final submission when one slot remains", async () => {
		await seedEventAndForm({ eventId: "cfp-concurrent-limit-event", slug: "cfp-concurrent-limit", formId: "cfp-concurrent-limit-form", limit: 1 });
		const results = await Promise.allSettled([
			insertSubmission(env.DB, { eventId: "cfp-concurrent-limit-event", formId: "cfp-concurrent-limit-form", submitterEmail: "race-a@example.test", submitterName: "Race A", answers: {}, speakers: [{ name: "Race A", email: "race-a@example.test" }] }),
			insertSubmission(env.DB, { eventId: "cfp-concurrent-limit-event", formId: "cfp-concurrent-limit-form", submitterEmail: "race-b@example.test", submitterName: "Race B", answers: {}, speakers: [{ name: "Race B", email: "race-b@example.test" }] }),
		]);
		expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
		expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
		expect(await env.DB.prepare("SELECT COUNT(*) AS count FROM submissions WHERE form_id = 'cfp-concurrent-limit-form'").first()).toEqual({ count: 1 });
	});

	it("keeps demo CFPs immutable even through the insertion domain path", async () => {
		await seedEventAndForm({ eventId: "cfp-demo-event", slug: "cfp-demo", formId: "cfp-demo-form", mode: "demo" });
		await expect(insertSubmission(env.DB, {
			eventId: "cfp-demo-event", formId: "cfp-demo-form", submitterEmail: "demo@example.test", submitterName: "Demo", answers: {}, speakers: [{ name: "Demo", email: "demo@example.test" }],
		})).rejects.toMatchObject({ code: "DEMO_EVENT_READ_ONLY" });
	});
});
