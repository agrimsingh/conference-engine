import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MessageTemplateKey } from "@/lib/domain/message-templates";
import { REPLY_TO_TEMPLATE_FAMILIES, type ReplyToTemplateFamily } from "./reply-to";

const mocks = vi.hoisted(() => ({
	getEventById: vi.fn(),
	getCloudflareEnv: vi.fn(),
	getAuthSecret: vi.fn(),
	renderEventMessageTemplate: vi.fn(),
	resolveEventReplyTo: vi.fn(),
	fetchWithBoundedRetry: vi.fn(),
}));

vi.mock("@/lib/db/queries", () => ({
	getEventById: mocks.getEventById,
}));

vi.mock("@/lib/db/cloudflare", () => ({
	getCloudflareEnv: mocks.getCloudflareEnv,
	getAuthSecret: mocks.getAuthSecret,
}));

vi.mock("./templates", () => ({
	renderEventMessageTemplate: mocks.renderEventMessageTemplate,
}));

vi.mock("./reply-to", async () => {
	const actual = await vi.importActual<typeof import("./reply-to")>("./reply-to");
	return {
		...actual,
		resolveEventReplyTo: mocks.resolveEventReplyTo,
	};
});

vi.mock("@/lib/security/fetch", () => ({
	fetchWithBoundedRetry: mocks.fetchWithBoundedRetry,
}));

import { sendTemplatedEmail } from "./resend";

function mockDb() {
	const first = vi.fn<(...args: unknown[]) => Promise<unknown>>(async () => null);
	const run = vi.fn(async () => ({ success: true, meta: { changes: 1 } }));
	return {
		prepare: () => ({
			bind: () => ({
				first,
				run,
			}),
		}),
		_first: first,
		_run: run,
	} as unknown as D1Database & { _first: typeof first; _run: typeof run };
}

describe("sendTemplatedEmail reply_to by template family", () => {
	const contact = "contact@event.test";
	const families = Object.keys(REPLY_TO_TEMPLATE_FAMILIES) as ReplyToTemplateFamily[];
	let capturedBodies: unknown[] = [];

	beforeEach(() => {
		capturedBodies = [];
		mocks.getEventById.mockResolvedValue({
			id: "evt-1",
			slug: "demo",
			name: "Demo",
			mode: "live",
			timezone: "UTC",
			start_day: "2026-03-01",
			end_day: "2026-03-02",
			created_at: 1,
			updated_at: 1,
		});
		mocks.getAuthSecret.mockResolvedValue("test-secret");
		mocks.getCloudflareEnv.mockResolvedValue({
			RESEND_API_KEY: "re_test",
			RESEND_FROM_EMAIL: "team@65labs.org",
		});
		mocks.renderEventMessageTemplate.mockResolvedValue({
			subject: "Hello",
			text: "Body",
		});
		mocks.resolveEventReplyTo.mockResolvedValue(contact);
		mocks.fetchWithBoundedRetry.mockImplementation(async (_url: string, init?: RequestInit) => {
			capturedBodies.push(JSON.parse(String(init?.body ?? "{}")));
			return new Response(JSON.stringify({ id: "email_test" }), { status: 200 });
		});
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	it.each(families)("%s sends Resend payload with reply_to", async (family) => {
		const templateKey = REPLY_TO_TEMPLATE_FAMILIES[family][0] as MessageTemplateKey;
		const db = mockDb();
		// reserveEmailDelivery INSERT … RETURNING succeeds once
		db._first.mockResolvedValueOnce({
			delivery_key: "dk",
			status: "sending",
			provider_id: null,
			lease_expires_at: Date.now() + 60_000,
		});
		// subsequent first() calls (historic one-shot check) return null
		db._first.mockResolvedValue(null);

		const result = await sendTemplatedEmail(db, {
			eventId: "evt-1",
			submissionId: null,
			templateKey,
			toEmail: "speaker@example.test",
			context: {
				eventName: "Demo",
				submitterName: "Ada",
				title: "Talk",
			},
			force: true,
			runtime: {
				authSecret: "test-secret",
				resendApiKey: "re_test",
				resendFromEmail: "team@65labs.org",
			},
		});

		expect(result.ok).toBe(true);
		expect(mocks.resolveEventReplyTo).toHaveBeenCalledWith(db, "evt-1");
		expect(capturedBodies).toHaveLength(1);
		expect(capturedBodies[0]).toMatchObject({
			from: "team@65labs.org",
			to: ["speaker@example.test"],
			reply_to: contact,
			subject: "Hello",
			text: "Body",
		});
	});

	it("omits reply_to for organizer submission fan-out templates", async () => {
		const db = mockDb();
		db._first.mockResolvedValueOnce({
			delivery_key: "dk",
			status: "sending",
			provider_id: null,
			lease_expires_at: Date.now() + 60_000,
		});
		db._first.mockResolvedValue(null);

		await sendTemplatedEmail(db, {
			eventId: "evt-1",
			submissionId: "sub-1",
			templateKey: "submission_received_organizer",
			toEmail: "owner@example.test",
			context: {
				eventName: "Demo",
				submitterName: "Owner",
				title: "Talk",
			},
			force: true,
			runtime: {
				authSecret: "test-secret",
				resendApiKey: "re_test",
				resendFromEmail: "team@65labs.org",
			},
		});

		expect(mocks.resolveEventReplyTo).not.toHaveBeenCalled();
		expect(capturedBodies[0]).toMatchObject({
			from: "team@65labs.org",
			to: ["owner@example.test"],
		});
		expect(capturedBodies[0]).not.toHaveProperty("reply_to");
	});
});
