import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { prepareDraftResumeDelivery } from "@/lib/cfp/drafts";
import { hmacHash } from "@/lib/security/crypto";

const state = vi.hoisted(() => ({
	cookies: new Map<string, string>(),
	kv: new Map<string, string>(),
}));

vi.mock("next/headers", () => ({
	cookies: async () => ({
		get: (name: string) => {
			const value = state.cookies.get(name);
			return value === undefined ? undefined : { name, value };
		},
	}),
}));

vi.mock("@/lib/db/cloudflare", () => ({
	getDb: async () => env.DB,
	getAuthSecret: async () => "portal-edit-secret",
	getSessionsKv: async () => ({
		get: async (key: string) => state.kv.get(key) ?? null,
	}),
}));

import { POST as recoverEditLink } from "@/app/api/portal/submissions/[submissionId]/edit-link/route";
import { GET as loadRecoveredProposal } from "@/app/api/e/[eventSlug]/submit/[formSlug]/draft/route";
import { PUT as saveRecoveredProposal } from "@/app/api/e/[eventSlug]/submit/[formSlug]/draft/save/route";
import { PORTAL_SESSION_COOKIE } from "@/lib/speakers/portal-session";

const now = Date.now();
const secret = "portal-edit-secret";

type SeedOptions = {
	readonly key: string;
	readonly personId?: string;
	readonly mode?: "live" | "demo";
	readonly formStatus?: "open" | "closed";
	readonly closesAt?: number | null;
	readonly draftsEnabled?: 0 | 1;
	readonly withDraft?: boolean;
};

async function seedSubmittedProposal(options: SeedOptions): Promise<{
	readonly submissionId: string;
	readonly draftId: string;
	readonly oldToken: string;
}> {
	const eventId = `${options.key}-event`;
	const formId = `${options.key}-form`;
	const submissionId = `${options.key}-submission`;
	const draftId = `${options.key}-draft`;
	const personId = options.personId ?? `${options.key}-person`;
	const oldToken = `${options.key}-old-token`;
	await env.DB.batch([
		env.DB.prepare("INSERT INTO events (id, slug, name, timezone, mode, created_at, updated_at) VALUES (?, ?, ?, 'UTC', 'live', ?, ?)").bind(eventId, options.key, options.key, now, now),
		env.DB.prepare("INSERT INTO cfp_forms (id, event_id, slug, title, status, drafts_enabled, closes_at, created_at, updated_at) VALUES (?, ?, 'cfp', 'CFP', ?, ?, ?, ?, ?)").bind(formId, eventId, options.formStatus ?? "open", options.draftsEnabled ?? 1, options.closesAt ?? null, now, now),
		env.DB.prepare("INSERT INTO people (id, email, name, created_at) VALUES (?, ?, 'Portal owner', ?)").bind(personId, `${personId}@example.test`, now),
	]);
	if (options.withDraft !== false) {
		await prepareDraftResumeDelivery(env.DB, {
			secret,
			eventId,
			formId,
			verifiedEmail: `${personId}@example.test`,
			draftId,
			token: oldToken,
			now,
		});
	}
	if (options.mode === "demo") {
		await env.DB.prepare("UPDATE events SET mode = 'demo' WHERE id = ?").bind(eventId).run();
	}
	await env.DB.prepare("INSERT INTO submissions (id, form_id, event_id, status, answers_json, submitter_email, submitter_name, submitter_person_id, created_at, updated_at, submitted_at) VALUES (?, ?, ?, 'submitted', '{}', ?, 'Portal owner', ?, ?, ?, ?)").bind(submissionId, formId, eventId, `${personId}@example.test`, personId, now, now, now).run();
	if (options.withDraft !== false) {
		await env.DB.prepare("UPDATE submission_drafts SET status = 'submitted', submission_id = ?, finalized_at = ? WHERE id = ?").bind(submissionId, now, draftId).run();
	}
	return { submissionId, draftId, oldToken };
}

function signIn(personId: string): void {
	state.kv.set("portal_session:portal-edit-session", JSON.stringify({
		email: `${personId}@example.test`,
		personId,
		createdAt: now,
	}));
	state.cookies.set(PORTAL_SESSION_COOKIE, "portal-edit-session");
}

function request(submissionId: string): Promise<Response> {
	return recoverEditLink(
		new Request(`https://conference.example.test/api/portal/submissions/${submissionId}/edit-link`, { method: "POST" }),
		{ params: Promise.resolve({ submissionId }) },
	);
}

async function tokenCount(draftId: string): Promise<number> {
	const row = await env.DB.prepare("SELECT COUNT(*) AS count FROM submission_draft_tokens WHERE draft_id = ?").bind(draftId).first<{ count: number }>();
	return row?.count ?? 0;
}

describe("portal proposal edit-link recovery", () => {
	beforeEach(() => {
		state.cookies.clear();
		state.kv.clear();
	});

	it("rotates an opaque edit token for the authenticated submitter while the CFP is open", async () => {
		const seeded = await seedSubmittedProposal({ key: "portal-edit-positive" });
		signIn("portal-edit-positive-person");

		const response = await request(seeded.submissionId);

		expect(response.status).toBe(200);
		const body = await response.json() as { ok: boolean; editUrl: string };
		expect(body.ok).toBe(true);
		const editUrl = new URL(body.editUrl);
		expect(editUrl.pathname).toBe("/e/portal-edit-positive/submit/cfp");
		const freshToken = editUrl.searchParams.get("draft");
		expect(freshToken).toMatch(/^[A-Za-z0-9_-]+$/);
		expect(freshToken).not.toBe(seeded.oldToken);
		expect(await tokenCount(seeded.draftId)).toBe(2);
		const currentHash = await hmacHash(secret, freshToken ?? "");
		expect(await env.DB.prepare("SELECT state FROM submission_draft_tokens WHERE token_hash = ?").bind(currentHash).first()).toEqual({ state: "current" });
	});

	it("denies an unauthenticated request without issuing a token", async () => {
		const seeded = await seedSubmittedProposal({ key: "portal-edit-unauth" });

		const response = await request(seeded.submissionId);

		expect(response.status).toBe(401);
		expect(await tokenCount(seeded.draftId)).toBe(1);
	});

	it("creates edit state for a direct submission even when draft saving is disabled", async () => {
		const seeded = await seedSubmittedProposal({
			key: "portal-edit-direct",
			draftsEnabled: 0,
			withDraft: false,
		});
		signIn("portal-edit-direct-person");

		const response = await request(seeded.submissionId);

		expect(response.status).toBe(200);
		const body = await response.json() as { editUrl: string };
		const token = new URL(body.editUrl).searchParams.get("draft") ?? "";
		const createdDraft = await env.DB.prepare("SELECT id FROM submission_drafts WHERE submission_id = ?").bind(seeded.submissionId).first<{ id: string }>();
		expect(createdDraft?.id).toBeTruthy();
		expect(await tokenCount(createdDraft?.id ?? "missing")).toBe(1);
		const loaded = await loadRecoveredProposal(
			new Request(`https://conference.example.test/api/e/portal-edit-direct/submit/cfp/draft?token=${encodeURIComponent(token)}`),
			{ params: Promise.resolve({ eventSlug: "portal-edit-direct", formSlug: "cfp" }) },
		);
		expect(loaded.status).toBe(200);
		expect(await loaded.json()).toMatchObject({
			ok: true,
			draft: { submissionId: seeded.submissionId, status: "submitted" },
		});
		const saved = await saveRecoveredProposal(
			new Request("https://conference.example.test/api/e/portal-edit-direct/submit/cfp/draft/save", {
				method: "PUT",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ token, submitterName: "Portal owner", answers: { title: "Recovered edit" } }),
			}),
			{ params: Promise.resolve({ eventSlug: "portal-edit-direct", formSlug: "cfp" }) },
		);
		expect(saved.status).toBe(200);
		expect(await env.DB.prepare("SELECT answers_json FROM submissions WHERE id = ?").bind(seeded.submissionId).first()).toEqual({ answers_json: "{\"title\":\"Recovered edit\"}" });
	});

	it("denies a different portal person without issuing a token", async () => {
		const seeded = await seedSubmittedProposal({ key: "portal-edit-wrong-owner" });
		signIn("portal-edit-other-person");

		const response = await request(seeded.submissionId);

		expect(response.status).toBe(404);
		expect(await tokenCount(seeded.draftId)).toBe(1);
	});

	it("denies a closed CFP without issuing a token", async () => {
		const seeded = await seedSubmittedProposal({ key: "portal-edit-closed", formStatus: "closed" });
		signIn("portal-edit-closed-person");

		const response = await request(seeded.submissionId);

		expect(response.status).toBe(409);
		expect(await tokenCount(seeded.draftId)).toBe(1);
	});

	it("denies a missing submission without issuing any token", async () => {
		signIn("portal-edit-missing-person");

		const response = await request("portal-edit-missing-submission");

		expect(response.status).toBe(404);
		expect(await env.DB.prepare("SELECT COUNT(*) AS count FROM submission_draft_tokens WHERE draft_id LIKE 'portal-edit-missing%'").first()).toEqual({ count: 0 });
	});

	it("denies a demo event without issuing a token", async () => {
		const seeded = await seedSubmittedProposal({ key: "portal-edit-demo", mode: "demo" });
		signIn("portal-edit-demo-person");

		const response = await request(seeded.submissionId);

		expect(response.status).toBe(403);
		expect(await tokenCount(seeded.draftId)).toBe(1);
	});
});
