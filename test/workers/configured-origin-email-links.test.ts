import { env } from "cloudflare:workers";
import { afterEach, describe, expect, it, vi } from "vitest";

const configuredOrigin = "https://conference.example";

vi.mock("@/lib/db/cloudflare", () => ({
	getAuthSecret: async () => "configured-origin-secret",
	getCloudflareEnv: async () => ({
		...env,
		APP_ORIGIN: configuredOrigin,
		RESEND_API_KEY: "test-key",
		RESEND_FROM_EMAIL: "team@example.test",
	}),
	getDb: async () => env.DB,
}));

import { POST as submitProposal } from "@/app/api/e/[eventSlug]/submit/[formSlug]/route";

const now = 1_780_900_000_000;

function request(body: Record<string, unknown>): Request {
	return new Request("https://evil.example/api/e/configured-origin/submit/cfp", {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify(body),
	});
}

describe("configured origins for CFP lifecycle email", () => {
	afterEach(() => vi.unstubAllGlobals());

	it("uses APP_ORIGIN for portal, admin, and co-speaker links when the submission request has an evil origin", async () => {
		// Given: a live CFP with an organizer and a pending co-speaker.
		await env.DB.batch([
			env.DB.prepare(
				"INSERT INTO events (id, slug, name, timezone, created_at, updated_at) VALUES ('configured-origin-event', 'configured-origin', 'Configured origin', 'UTC', ?, ?)",
			).bind(now, now),
			env.DB.prepare(
				"INSERT INTO accounts (id, email, name, created_at, updated_at) VALUES ('configured-origin-owner', 'owner@configured.example', 'Owner', ?, ?)",
			).bind(now, now),
			env.DB.prepare(
				"INSERT INTO event_memberships (id, event_id, account_id, role, created_at) VALUES ('configured-origin-membership', 'configured-origin-event', 'configured-origin-owner', 'admin', ?)",
			).bind(now),
			env.DB.prepare(
				"INSERT INTO event_ownership (event_id, account_id, created_at, updated_at) VALUES ('configured-origin-event', 'configured-origin-owner', ?, ?)",
			).bind(now, now),
			env.DB.prepare(
				"INSERT INTO cfp_forms (id, event_id, slug, title, status, created_at, updated_at) VALUES ('configured-origin-form', 'configured-origin-event', 'cfp', 'CFP', 'open', ?, ?)",
			).bind(now, now),
			env.DB.prepare(
				"INSERT INTO form_fields (id, form_id, key, label, field_type, required, position, visibility_rule, config) VALUES ('configured-origin-title', 'configured-origin-form', 'title', 'Title', 'text', 1, 0, '{\"op\":\"always\"}', '{\"kind\":\"text\"}')",
			),
			env.DB.prepare(
				"INSERT INTO form_fields (id, form_id, key, label, field_type, required, position, visibility_rule, config) VALUES ('configured-origin-speakers', 'configured-origin-form', 'speakers', 'Speakers', 'speaker_block', 1, 1, '{\"op\":\"always\"}', '{\"kind\":\"speaker_block\",\"minSpeakers\":1,\"maxSpeakers\":3}')",
			),
		]);
		const fetchMock = vi.fn(async () => new Response(JSON.stringify({ id: crypto.randomUUID() }), { status: 200 }));
		vi.stubGlobal("fetch", fetchMock);

		// When: the public submission endpoint receives a request with an untrusted host.
		const response = await submitProposal(request({
			submitterName: "Ada",
			submitterEmail: "ada@configured.example",
			answers: {
				title: "Origin boundary",
				speakers: [
					{ name: "Ada", email: "ada@configured.example" },
					{ name: "Bea", email: "bea@configured.example" },
				],
			},
		}), { params: Promise.resolve({ eventSlug: "configured-origin", formSlug: "cfp" }) });

		// Then: every action link in the delivered envelopes uses the configured origin.
		expect(response.status).toBe(200);
		const body = await response.json() as { submissionId: string };
		const deliveries = await env.DB.prepare(
			"SELECT template_key, text_body FROM email_delivery_envelopes WHERE submission_id = ? ORDER BY template_key",
		).bind(body.submissionId).all<{ template_key: string; text_body: string }>();
		const textByTemplate = new Map(deliveries.results.map((delivery) => [delivery.template_key, delivery.text_body]));
		expect(textByTemplate.get("submission_received")).toContain(`${configuredOrigin}/portal`);
		expect(textByTemplate.get("submission_received_organizer")).toContain(
			`${configuredOrigin}/admin/events/configured-origin/submissions/${body.submissionId}`,
		);
		expect(textByTemplate.get("co_speaker_invite")).toContain(`${configuredOrigin}/co-speaker/`);
		for (const text of textByTemplate.values()) {
			expect(text).not.toContain("https://evil.example");
		}
		expect(fetchMock).toHaveBeenCalledTimes(3);
	});
});
