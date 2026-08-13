import { env } from "cloudflare:workers";
import { afterEach, describe, expect, it, vi } from "vitest";
import { finalizeDraft, prepareDraftResumeDelivery } from "@/lib/cfp/drafts";
import { notifyOrganizersOfSubmission } from "@/lib/email/notify";

vi.mock("@/lib/db/cloudflare", () => ({
	getDb: async () => env.DB,
	getAuthSecret: async () => "organizer-notify-secret",
	getCloudflareEnv: async () => ({
		...env,
		APP_ORIGIN: "https://conference.example.test",
		RESEND_API_KEY: "test-key",
		RESEND_FROM_EMAIL: "team@example.test",
	}),
}));

import { POST as finalizeDraftRoute } from "@/app/api/e/[eventSlug]/submit/[formSlug]/draft/finalize/route";

const now = Date.now();
const secret = "organizer-notify-secret";
const runtime = {
	authSecret: secret,
	resendApiKey: "test-key",
	resendFromEmail: "team@example.test",
};

function jsonRequest(url: string, body: Record<string, unknown>): Request {
	return new Request(url, {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify(body),
	});
}

async function seedEvent(args: {
	eventId: string;
	eventSlug: string;
	formId: string;
	ownerEmail: string;
	adminEmail: string;
}): Promise<void> {
	await env.DB.batch([
		env.DB.prepare(
			"INSERT INTO events (id, slug, name, timezone, created_at, updated_at) VALUES (?, ?, ?, 'UTC', ?, ?)",
		).bind(args.eventId, args.eventSlug, args.eventSlug, now, now),
		env.DB.prepare(
			"INSERT INTO accounts (id, email, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?), (?, ?, ?, ?, ?)",
		).bind(
			`${args.eventId}-owner`,
			args.ownerEmail,
			"Owner",
			now,
			now,
			`${args.eventId}-admin`,
			args.adminEmail,
			"Admin",
			now,
			now,
		),
		env.DB.prepare(
			"INSERT INTO event_memberships (id, event_id, account_id, role, created_at) VALUES (?, ?, ?, 'admin', ?), (?, ?, ?, 'admin', ?)",
		).bind(
			`${args.eventId}-m-owner`,
			args.eventId,
			`${args.eventId}-owner`,
			now,
			`${args.eventId}-m-admin`,
			args.eventId,
			`${args.eventId}-admin`,
			now,
		),
		env.DB.prepare(
			"INSERT INTO event_ownership (event_id, account_id, created_at, updated_at) VALUES (?, ?, ?, ?)",
		).bind(args.eventId, `${args.eventId}-owner`, now, now),
		env.DB.prepare(
			"INSERT INTO cfp_forms (id, event_id, slug, title, status, drafts_enabled, created_at, updated_at) VALUES (?, ?, 'cfp', 'CFP', 'open', 1, ?, ?)",
		).bind(args.formId, args.eventId, now, now),
		env.DB.prepare(
			"INSERT INTO form_fields (id, form_id, key, label, field_type, required, position, visibility_rule, config) VALUES (?, ?, 'title', 'Title', 'text', 1, 0, '{\"op\":\"always\"}', '{\"kind\":\"text\"}')",
		).bind(`${args.formId}-title`, args.formId),
		env.DB.prepare(
			"INSERT INTO form_fields (id, form_id, key, label, field_type, required, position, visibility_rule, config) VALUES (?, ?, 'speakers', 'Speakers', 'speaker_block', 1, 1, '{\"op\":\"always\"}', '{\"kind\":\"speaker_block\",\"minSpeakers\":1,\"maxSpeakers\":3}')",
		).bind(`${args.formId}-speakers`, args.formId),
	]);
}

function sentTo(fetchMock: ReturnType<typeof vi.fn>): string[] {
	return fetchMock.mock.calls
		.map(([, init]) => JSON.parse(String((init as RequestInit).body)) as { to: string[] })
		.flatMap((body) => body.to)
		.sort();
}

describe("organizer submission notify", () => {
	afterEach(() => vi.unstubAllGlobals());

	it("defaults to create notify on and update notify off", async () => {
		const eventId = "org-notify-event";
		const formId = "org-notify-form";
		const draftId = "org-notify-draft";
		const token = "org-notify-token";
		await seedEvent({
			eventId,
			eventSlug: "org-notify",
			formId,
			ownerEmail: "owner@org.notify",
			adminEmail: "admin@org.notify",
		});
		const prefs = await env.DB.prepare(
			"SELECT notify_on_submission_create, notify_on_submission_update FROM events WHERE id = ?",
		)
			.bind(eventId)
			.first<{ notify_on_submission_create: number; notify_on_submission_update: number }>();
		expect(prefs).toEqual({
			notify_on_submission_create: 1,
			notify_on_submission_update: 0,
		});

		await prepareDraftResumeDelivery(env.DB, {
			secret,
			eventId,
			formId,
			verifiedEmail: "speaker@org.notify",
			submitterName: "Ada",
			draftId,
			token,
			now,
			answers: { title: "Original", speakers: [{ name: "Ada", email: "speaker@org.notify" }] },
		});

		const fetchMock = vi.fn(
			async () => new Response(JSON.stringify({ id: crypto.randomUUID() }), { status: 200 }),
		);
		vi.stubGlobal("fetch", fetchMock);

		const created = await finalizeDraft(env.DB, {
			secret,
			draftId,
			token,
			submitterName: "Ada",
			answers: { title: "Original", speakers: [{ name: "Ada", email: "speaker@org.notify" }] },
			speakers: [{ name: "Ada", email: "speaker@org.notify" }],
			now: now + 1,
		});
		expect(created.outcome).toBe("created");

		const createMails = await notifyOrganizersOfSubmission(env.DB, {
			submissionId: created.submissionId,
			kind: "created",
			origin: "https://conference.example.test",
			runtime,
		});
		expect(createMails.every((mail) => mail.ok && mail.status === "sent")).toBe(true);
		expect(sentTo(fetchMock)).toEqual(["admin@org.notify", "owner@org.notify"]);

		const createRows = await env.DB.prepare(
			"SELECT to_email, template_key, status FROM email_deliveries WHERE submission_id = ? AND template_key = 'submission_received_organizer' ORDER BY to_email",
		)
			.bind(created.submissionId)
			.all<{ to_email: string; template_key: string; status: string }>();
		expect(createRows.results).toEqual([
			{ to_email: "admin@org.notify", template_key: "submission_received_organizer", status: "sent" },
			{ to_email: "owner@org.notify", template_key: "submission_received_organizer", status: "sent" },
		]);

		fetchMock.mockClear();
		const replay = await notifyOrganizersOfSubmission(env.DB, {
			submissionId: created.submissionId,
			kind: "created",
			origin: "https://conference.example.test",
			runtime,
		});
		expect(replay.every((mail) => mail.ok && mail.status === "skipped")).toBe(true);
		expect(fetchMock).not.toHaveBeenCalled();

		const updated = await finalizeDraft(env.DB, {
			secret,
			draftId,
			token: created.editToken,
			submitterName: "Ada Lovelace",
			answers: {
				title: "Revised",
				speakers: [{ name: "Ada Lovelace", email: "speaker@org.notify" }],
			},
			speakers: [{ name: "Ada Lovelace", email: "speaker@org.notify" }],
			now: now + 2,
		});
		expect(updated.outcome).toBe("updated");

		fetchMock.mockClear();
		const updateMails = await notifyOrganizersOfSubmission(env.DB, {
			submissionId: updated.submissionId,
			kind: "updated",
			origin: "https://conference.example.test",
			runtime,
		});
		expect(updateMails).toEqual([]);
		expect(fetchMock).not.toHaveBeenCalled();

		const updateRows = await env.DB.prepare(
			"SELECT to_email FROM email_deliveries WHERE submission_id = ? AND template_key = 'submission_updated_organizer'",
		)
			.bind(updated.submissionId)
			.all<{ to_email: string }>();
		expect(updateRows.results).toEqual([]);
	});

	it("emails organizers on update only when notify_on_submission_update is enabled", async () => {
		const eventId = "org-notify-update-on";
		const formId = "org-notify-update-form";
		const draftId = "org-notify-update-draft";
		const token = "org-notify-update-token";
		await seedEvent({
			eventId,
			eventSlug: "org-notify-update",
			formId,
			ownerEmail: "owner@org.update",
			adminEmail: "admin@org.update",
		});
		await env.DB.prepare(
			"UPDATE events SET notify_on_submission_update = 1 WHERE id = ?",
		)
			.bind(eventId)
			.run();
		await prepareDraftResumeDelivery(env.DB, {
			secret,
			eventId,
			formId,
			verifiedEmail: "speaker@org.update",
			submitterName: "Ada",
			draftId,
			token,
			now,
			answers: { title: "Original", speakers: [{ name: "Ada", email: "speaker@org.update" }] },
		});

		const fetchMock = vi.fn(
			async () => new Response(JSON.stringify({ id: crypto.randomUUID() }), { status: 200 }),
		);
		vi.stubGlobal("fetch", fetchMock);

		const created = await finalizeDraft(env.DB, {
			secret,
			draftId,
			token,
			submitterName: "Ada",
			answers: { title: "Original", speakers: [{ name: "Ada", email: "speaker@org.update" }] },
			speakers: [{ name: "Ada", email: "speaker@org.update" }],
			now: now + 1,
		});
		expect(created.outcome).toBe("created");

		const updated = await finalizeDraft(env.DB, {
			secret,
			draftId,
			token: created.editToken,
			submitterName: "Ada Lovelace",
			answers: {
				title: "Revised",
				speakers: [{ name: "Ada Lovelace", email: "speaker@org.update" }],
			},
			speakers: [{ name: "Ada Lovelace", email: "speaker@org.update" }],
			now: now + 2,
		});
		expect(updated.outcome).toBe("updated");

		fetchMock.mockClear();
		const updateMails = await notifyOrganizersOfSubmission(env.DB, {
			submissionId: updated.submissionId,
			kind: "updated",
			origin: "https://conference.example.test",
			runtime,
		});
		expect(updateMails.every((mail) => mail.ok && mail.status === "sent")).toBe(true);
		expect(sentTo(fetchMock)).toEqual(["admin@org.update", "owner@org.update"]);

		fetchMock.mockClear();
		const updateReplay = await notifyOrganizersOfSubmission(env.DB, {
			submissionId: updated.submissionId,
			kind: "updated",
			origin: "https://conference.example.test",
			runtime,
		});
		expect(updateReplay.every((mail) => mail.ok && mail.status === "skipped")).toBe(true);
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("finalize route notifies organizers without mailing on draft save", async () => {
		const eventId = "org-route-event";
		const formId = "org-route-form";
		const draftId = "org-route-draft";
		const token = "org-route-token";
		await seedEvent({
			eventId,
			eventSlug: "org-route",
			formId,
			ownerEmail: "owner@org.route",
			adminEmail: "admin@org.route",
		});
		await prepareDraftResumeDelivery(env.DB, {
			secret,
			eventId,
			formId,
			verifiedEmail: "speaker@org.route",
			submitterName: "Bea",
			draftId,
			token,
			now,
			answers: { title: "Talk", speakers: [{ name: "Bea", email: "speaker@org.route" }] },
		});

		const fetchMock = vi.fn(
			async () => new Response(JSON.stringify({ id: crypto.randomUUID() }), { status: 200 }),
		);
		vi.stubGlobal("fetch", fetchMock);

		const response = await finalizeDraftRoute(
			jsonRequest("https://evil.example/api/e/org-route/submit/cfp/draft/finalize", {
				token,
				submitterName: "Bea",
				answers: { title: "Talk", speakers: [{ name: "Bea", email: "speaker@org.route" }] },
			}),
			{ params: Promise.resolve({ eventSlug: "org-route", formSlug: "cfp" }) },
		);
		expect(response.status).toBe(200);
		const body = (await response.json()) as { ok: boolean; submissionId: string };
		expect(body.ok).toBe(true);

		const organizerDeliveries = await env.DB.prepare(
			"SELECT to_email FROM email_deliveries WHERE submission_id = ? AND template_key = 'submission_received_organizer' ORDER BY to_email",
		)
			.bind(body.submissionId)
			.all<{ to_email: string }>();
		expect(organizerDeliveries.results.map((row) => row.to_email)).toEqual([
			"admin@org.route",
			"owner@org.route",
		]);
		expect(sentTo(fetchMock)).toEqual(
			expect.arrayContaining(["admin@org.route", "owner@org.route", "speaker@org.route"]),
		);
		const envelopeRows = await env.DB.prepare(
			"SELECT template_key, text_body FROM email_delivery_envelopes WHERE submission_id = ?",
		)
			.bind(body.submissionId)
			.all<{ template_key: string; text_body: string }>();
		const textByTemplate = new Map(
			envelopeRows.results.map((row) => [row.template_key, row.text_body]),
		);
		expect(textByTemplate.get("submission_received")).toContain("https://conference.example.test/portal");
		expect(textByTemplate.get("submission_received_organizer")).toContain(
			`https://conference.example.test/admin/events/org-route/submissions/${body.submissionId}`,
		);
		for (const text of textByTemplate.values()) {
			expect(text).not.toContain("https://evil.example");
		}
	});
});
