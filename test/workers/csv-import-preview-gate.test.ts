import { env } from "cloudflare:workers";
import { NextResponse } from "next/server";
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	authorizeWritableEventAdminApi: vi.fn(),
	authorizeContactsApi: vi.fn(),
}));

vi.mock("@/lib/db/cloudflare", () => ({ getDb: async () => env.DB }));
vi.mock("@/lib/auth/admin", () => ({
	authorizeWritableEventAdminApi: mocks.authorizeWritableEventAdminApi,
	authorizeEventAdminApi: vi.fn(),
}));
vi.mock("@/lib/contacts/auth", () => ({ authorizeContactsApi: mocks.authorizeContactsApi }));

import { POST as contactsImport } from "@/app/api/admin/contacts/import/route";
import { POST as speakersPost } from "@/app/api/admin/events/[eventSlug]/speakers/route";

const now = 1_780_900_000_000;
const event = {
	id: "csv-gate-event",
	slug: "csv-gate",
	name: "CSV gate",
	timezone: "UTC",
	mode: "live" as const,
	created_at: now,
	updated_at: now,
};
const account = { id: "csv-gate-account", email: "org@example.test", name: "Org", created_at: now, updated_at: now };

const CSV = "email,name\ngate@example.test,Gate Person\n";

describe("CSV import preview gate", () => {
	it("rejects write-now contact CSV and does not persist rows", async () => {
		await env.DB.prepare(
			"INSERT INTO accounts (id, email, name, created_at, updated_at) VALUES (?, ?, 'Org', ?, ?)",
		)
			.bind(account.id, account.email, now, now)
			.run();
		mocks.authorizeContactsApi.mockResolvedValue({ ok: true, account });

		const response = await contactsImport();
		expect(response.status).toBe(410);
		expect(await response.json()).toMatchObject({ ok: false });
		expect(
			(await env.DB.prepare("SELECT COUNT(*) AS count FROM account_contacts WHERE account_id = ?").bind(account.id).first<{ count: number }>())
				?.count,
		).toBe(0);
	});

	it("rejects write-now speaker CSV and still allows JSON upsert", async () => {
		await env.DB.prepare(
			"INSERT INTO events (id, slug, name, timezone, created_at, updated_at) VALUES (?, ?, ?, 'UTC', ?, ?)",
		)
			.bind(event.id, event.slug, event.name, now, now)
			.run();
		mocks.authorizeWritableEventAdminApi.mockResolvedValue({
			ok: true,
			access: { event, account: null, membership: null },
		});
		const context = { params: Promise.resolve({ eventSlug: event.slug }) };

		const raw = await speakersPost(
			new Request(`https://conference.example.test/api/admin/events/${event.slug}/speakers`, {
				method: "POST",
				headers: { "content-type": "text/csv" },
				body: CSV,
			}),
			context,
		);
		expect(raw.status).toBe(410);

		const wrapped = await speakersPost(
			new Request(`https://conference.example.test/api/admin/events/${event.slug}/speakers`, {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ csv: CSV }),
			}),
			context,
		);
		expect(wrapped.status).toBe(410);
		expect(
			(await env.DB.prepare("SELECT COUNT(*) AS count FROM event_speaker_profiles WHERE event_id = ?").bind(event.id).first<{ count: number }>())
				?.count,
		).toBe(0);

		const upsert = await speakersPost(
			new Request(`https://conference.example.test/api/admin/events/${event.slug}/speakers`, {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ email: "one@example.test", name: "One Speaker" }),
			}),
			context,
		);
		expect(upsert.status).toBe(200);
		expect(
			(await env.DB.prepare("SELECT COUNT(*) AS count FROM event_speaker_profiles WHERE event_id = ?").bind(event.id).first<{ count: number }>())
				?.count,
		).toBe(1);
	});

	it("still 401s the retired contacts import without a session", async () => {
		mocks.authorizeContactsApi.mockResolvedValue({
			ok: false,
			response: NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 }),
		});
		const response = await contactsImport();
		expect(response.status).toBe(401);
	});
});
