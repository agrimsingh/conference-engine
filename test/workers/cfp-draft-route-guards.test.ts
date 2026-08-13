import { env } from "cloudflare:workers";
import { describe, expect, it, vi } from "vitest";
import { prepareDraftResumeDelivery } from "@/lib/cfp/drafts";

vi.mock("@/lib/db/cloudflare", () => ({
	getDb: async () => env.DB,
	getAuthSecret: async () => "cfp-draft-route-secret",
}));

vi.mock("@/lib/speakers/portal-session", () => ({
	readPortalSession: async () => ({ email: "draft@example.test" }),
	readPortalSessionFromCookie: async () => ({ email: "draft@example.test" }),
}));

import { POST as finalizeDraftRoute } from "@/app/api/e/[eventSlug]/submit/[formSlug]/draft/finalize/route";
import { GET as loadDraft } from "@/app/api/e/[eventSlug]/submit/[formSlug]/draft/route";
import { PUT as saveDraft } from "@/app/api/e/[eventSlug]/submit/[formSlug]/draft/save/route";
import { POST as savePortalDraft } from "@/app/api/e/[eventSlug]/submit/[formSlug]/draft/portal/route";

const now = Date.now();
const token = "cfp-draft-route-token";

function jsonRequest(url: string, method: "PUT" | "POST", body: Record<string, unknown>): Request {
	return new Request(url, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
}

async function seed(args: {
	eventId: string;
	eventSlug: string;
	formId: string;
	formSlug: string;
	status?: "open" | "closed";
	draftsEnabled?: number;
	draftToken?: string;
	opensAt?: number | null;
	closesAt?: number | null;
}): Promise<void> {
	await env.DB.batch([
		env.DB.prepare("INSERT INTO events (id, slug, name, timezone, created_at, updated_at) VALUES (?, ?, ?, 'UTC', ?, ?)").bind(args.eventId, args.eventSlug, args.eventSlug, now, now),
		env.DB.prepare("INSERT INTO cfp_forms (id, event_id, slug, title, status, drafts_enabled, opens_at, closes_at, created_at, updated_at) VALUES (?, ?, ?, 'CFP', ?, ?, ?, ?, ?, ?)").bind(args.formId, args.eventId, args.formSlug, args.status ?? "open", args.draftsEnabled ?? 1, args.opensAt ?? null, args.closesAt ?? null, now, now),
	]);
	await prepareDraftResumeDelivery(env.DB, { secret: "cfp-draft-route-secret", eventId: args.eventId, formId: args.formId, verifiedEmail: "draft@example.test", submitterName: "Saved", draftId: `${args.formId}-draft`, token: args.draftToken ?? token, now });
}

async function draftSnapshot(draftId: string) {
	const tokens = await env.DB.prepare("SELECT token_hash, state, expires_at, consumed_at FROM submission_draft_tokens WHERE draft_id = ? ORDER BY created_at").bind(draftId).all();
	return {
		draft: await env.DB.prepare("SELECT answers_json, submitter_name, status FROM submission_drafts WHERE id = ?").bind(draftId).first(),
		tokens: tokens.results,
	};
}

describe("draft route guards", () => {
	it("round-trips a title-only draft through save and resume before submission", async () => {
		const resumeToken = "cfp-title-only-resume-token";
		await seed({ eventId: "draft-resume-event", eventSlug: "draft-resume", formId: "draft-resume-form", formSlug: "cfp", draftToken: resumeToken });
		const context = { params: Promise.resolve({ eventSlug: "draft-resume", formSlug: "cfp" }) };
		const saved = await saveDraft(
			jsonRequest("https://conference.example.test/api/e/draft-resume/submit/cfp/draft/save", "PUT", {
				token: resumeToken,
				submitterName: "Draft Speaker",
				answers: { title: "A title saved before the abstract" },
			}),
			context,
		);
		expect(saved.status).toBe(200);
		const savedBody = await saved.json() as { ok: boolean; draftId: string; token: string };
		expect(savedBody).toMatchObject({ ok: true, draftId: "draft-resume-form-draft" });
		expect(savedBody.token).not.toBe(resumeToken);

		const resumed = await loadDraft(
			new Request(`https://conference.example.test/api/e/draft-resume/submit/cfp/draft?token=${savedBody.token}`),
			context,
		);
		expect(resumed.status).toBe(200);
		expect(await resumed.json()).toMatchObject({
			ok: true,
			draft: {
				status: "draft",
				submitterName: "Draft Speaker",
				answers: { title: "A title saved before the abstract" },
				submissionId: null,
			},
		});
		expect(await env.DB.prepare("SELECT COUNT(*) AS count FROM submissions WHERE event_id = ?").bind("draft-resume-event").first()).toEqual({ count: 0 });
	});

	it("does not load, save, or finalize a token through another event/form URL", async () => {
		await seed({ eventId: "draft-owner-event", eventSlug: "draft-owner", formId: "draft-owner-form", formSlug: "cfp" });
		await seed({ eventId: "draft-other-event", eventSlug: "draft-other", formId: "draft-other-form", formSlug: "cfp", draftToken: "cfp-draft-other-token" });
		const context = { params: Promise.resolve({ eventSlug: "draft-other", formSlug: "cfp" }) };
		const before = await env.DB.prepare("SELECT answers_json, status FROM submission_drafts WHERE id = 'draft-owner-form-draft'").first();
		expect((await saveDraft(jsonRequest("https://conference.example.test/api/e/draft-other/submit/cfp/draft/save", "PUT", { token, submitterName: "Changed", answers: { title: "wrong route" } }), context)).status).toBe(404);
		expect((await finalizeDraftRoute(jsonRequest("https://conference.example.test/api/e/draft-other/submit/cfp/draft/finalize", "POST", { token, submitterName: "Changed", answers: {} }), context)).status).toBe(404);
		expect(await env.DB.prepare("SELECT answers_json, status FROM submission_drafts WHERE id = 'draft-owner-form-draft'").first()).toEqual(before);
	});

	it("blocks load and save when the form is closed or draft saving is disabled", async () => {
		const closedToken = "cfp-draft-closed-token";
		await seed({ eventId: "draft-closed-event", eventSlug: "draft-closed", formId: "draft-closed-form", formSlug: "cfp", status: "closed", draftToken: closedToken });
		const closed = { params: Promise.resolve({ eventSlug: "draft-closed", formSlug: "cfp" }) };
		expect((await loadDraft(new Request(`https://conference.example.test/api/e/draft-closed/submit/cfp/draft?token=${closedToken}`), closed)).status).toBe(404);
		expect((await saveDraft(jsonRequest("https://conference.example.test/api/e/draft-closed/submit/cfp/draft/save", "PUT", { token: closedToken, submitterName: "Changed", answers: {} }), closed)).status).toBe(404);
		const disabledToken = "cfp-draft-disabled-token";
		await seed({ eventId: "draft-disabled-event", eventSlug: "draft-disabled", formId: "draft-disabled-form", formSlug: "cfp", draftsEnabled: 0, draftToken: disabledToken });
		const disabled = { params: Promise.resolve({ eventSlug: "draft-disabled", formSlug: "cfp" }) };
		expect((await loadDraft(new Request(`https://conference.example.test/api/e/draft-disabled/submit/cfp/draft?token=${disabledToken}`), disabled)).status).toBe(404);
		expect((await saveDraft(jsonRequest("https://conference.example.test/api/e/draft-disabled/submit/cfp/draft/save", "PUT", { token: disabledToken, submitterName: "Changed", answers: {} }), disabled)).status).toBe(404);
	});

	it("does not mutate portal-token drafts through a different, unavailable, or out-of-window CFP", async () => {
		const ownerToken = "cfp-portal-owner-token";
		const closedToken = "cfp-portal-closed-token";
		const disabledToken = "cfp-portal-disabled-token";
		const beforeOpenToken = "cfp-portal-before-open-token";
		const afterCloseToken = "cfp-portal-after-close-token";
		await seed({ eventId: "portal-owner-event", eventSlug: "portal-owner", formId: "portal-owner-form", formSlug: "cfp", draftToken: ownerToken });
		await seed({ eventId: "portal-other-event", eventSlug: "portal-other", formId: "portal-other-form", formSlug: "cfp", draftToken: "cfp-portal-other-token" });
		await seed({ eventId: "portal-closed-event", eventSlug: "portal-closed", formId: "portal-closed-form", formSlug: "cfp", status: "closed", draftToken: closedToken });
		await seed({ eventId: "portal-disabled-event", eventSlug: "portal-disabled", formId: "portal-disabled-form", formSlug: "cfp", draftsEnabled: 0, draftToken: disabledToken });
		await seed({ eventId: "portal-before-open-event", eventSlug: "portal-before-open", formId: "portal-before-open-form", formSlug: "cfp", opensAt: now + 60_000, draftToken: beforeOpenToken });
		await seed({ eventId: "portal-after-close-event", eventSlug: "portal-after-close", formId: "portal-after-close-form", formSlug: "cfp", closesAt: now - 60_000, draftToken: afterCloseToken });

		const attempts = [
			{ draftId: "portal-owner-form-draft", token: ownerToken, eventSlug: "portal-other" },
			{ draftId: "portal-closed-form-draft", token: closedToken, eventSlug: "portal-closed" },
			{ draftId: "portal-disabled-form-draft", token: disabledToken, eventSlug: "portal-disabled" },
			{ draftId: "portal-before-open-form-draft", token: beforeOpenToken, eventSlug: "portal-before-open" },
			{ draftId: "portal-after-close-form-draft", token: afterCloseToken, eventSlug: "portal-after-close" },
		];

		for (const attempt of attempts) {
			const before = await draftSnapshot(attempt.draftId);
			const response = await savePortalDraft(
				jsonRequest(`https://conference.example.test/api/e/${attempt.eventSlug}/submit/cfp/draft/portal`, "POST", { draftToken: attempt.token, submitterName: "Changed", answers: { title: "should not save" } }),
				{ params: Promise.resolve({ eventSlug: attempt.eventSlug, formSlug: "cfp" }) },
			);
			expect(response.status).toBe(404);
			expect(await draftSnapshot(attempt.draftId)).toEqual(before);
		}
	});

	it("saves a valid matching portal draft and rotates its token", async () => {
		const matchingToken = "cfp-portal-matching-token";
		await seed({ eventId: "portal-match-event", eventSlug: "portal-match", formId: "portal-match-form", formSlug: "cfp", draftToken: matchingToken });
		const response = await savePortalDraft(
			jsonRequest("https://conference.example.test/api/e/portal-match/submit/cfp/draft/portal", "POST", { draftToken: matchingToken, submitterName: "Updated", answers: { title: "saved through the portal" } }),
			{ params: Promise.resolve({ eventSlug: "portal-match", formSlug: "cfp" }) },
		);
		expect(response.status).toBe(200);
		const body = await response.json() as { ok: boolean; draftId: string; token: string };
		expect(body).toMatchObject({ ok: true, draftId: "portal-match-form-draft" });
		expect(body.token).not.toBe(matchingToken);
		const saved = await draftSnapshot("portal-match-form-draft");
		expect(saved.draft).toEqual({ answers_json: JSON.stringify({ title: "saved through the portal" }), submitter_name: "Updated", status: "draft" });
		expect(saved.tokens).toHaveLength(2);
		expect(saved.tokens.map((savedToken) => savedToken.state).sort()).toEqual(["current", "superseded"]);
	});

	it("rate limits repeated draft saves after validation succeeds", async () => {
		const rateToken = "cfp-draft-rate-token";
		await seed({ eventId: "draft-rate-event", eventSlug: "draft-rate", formId: "draft-rate-form", formSlug: "cfp", draftToken: rateToken });
		const context = { params: Promise.resolve({ eventSlug: "draft-rate", formSlug: "cfp" }) };
		const body = { token: rateToken, submitterName: "Saved", answers: { title: "Draft" } };
		let lastStatus = 0;
		for (let attempt = 0; attempt < 181; attempt += 1) {
			const response = await saveDraft(jsonRequest("https://conference.example.test/api/e/draft-rate/submit/cfp/draft/save", "PUT", body), context);
			lastStatus = response.status;
			if (response.status === 429) break;
		}
		expect(lastStatus).toBe(429);
		const payload = await saveDraft(jsonRequest("https://conference.example.test/api/e/draft-rate/submit/cfp/draft/save", "PUT", body), context).then((response) => response.json());
		expect(payload).toMatchObject({ ok: false, error: expect.stringMatching(/too many draft saves/i) });
	});
});
