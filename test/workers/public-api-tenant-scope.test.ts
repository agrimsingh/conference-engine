import { env } from "cloudflare:workers";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db/cloudflare", () => ({
	getAuthSecret: async () => env.AUTH_SECRET,
	getDb: async () => env.DB,
	getCloudflareEnv: async () => env,
}));

import { GET as getSchedule } from "@/app/api/v1/events/[eventSlug]/schedule/route";
import { GET as getSubmissions } from "@/app/api/v1/events/[eventSlug]/submissions/route";
import { createToken } from "@/lib/auth/event-api-tokens";
import { createEventWithDefaults } from "@/lib/events/create-event";
import { createSession } from "@/lib/sessions/session";

const now = 1_786_300_000_000;
let sequence = 0;

async function seedEvent(label: string) {
	sequence += 1;
	const created = await createEventWithDefaults(
		env.DB,
		{
			name: `API tenant ${label} ${sequence}`,
			slug: `api-tenant-${label}-${sequence}`,
			timezone: "UTC",
			startDay: "2026-12-04",
			endDay: "2026-12-04",
		},
		null,
	);
	await createSession(env.DB, {
		eventId: created.eventId,
		origin: "manual",
		input: {
			title: `${label} talk`,
			speakers: [
				{
					name: "Tenant Scope",
					email: `tenant-${label}-${sequence}@test.invalid`,
				},
			],
		},
	});
	return created;
}

describe("v1 tenant scope", () => {
	it("scopes event PAT access on submissions to its own event", async () => {
		const eventA = await seedEvent("submissions-a");
		const eventB = await seedEvent("submissions-b");
		const created = await createToken(env.DB, {
			secret: env.AUTH_SECRET,
			eventId: eventA.eventId,
			name: "Event A submissions reader",
			createdByAccountId: null,
			now,
			token: `ce_pat_submissions-${sequence}`,
		});
		const request = (eventSlug: string) =>
			getSubmissions(
				new Request(
					`https://conference.example.test/api/v1/events/${eventSlug}/submissions`,
					{ headers: { authorization: `Bearer ${created.token}` } },
				),
				{ params: Promise.resolve({ eventSlug }) },
			);

		expect((await request(eventB.slug)).status).toBe(401);
		expect((await request(eventA.slug)).status).toBe(200);
	});

	it("scopes event PAT access on schedule to its own event", async () => {
		const eventA = await seedEvent("schedule-a");
		const eventB = await seedEvent("schedule-b");
		const created = await createToken(env.DB, {
			secret: env.AUTH_SECRET,
			eventId: eventA.eventId,
			name: "Event A schedule reader",
			createdByAccountId: null,
			now,
			token: `ce_pat_schedule-${sequence}`,
		});
		const request = (eventSlug: string) =>
			getSchedule(
				new Request(
					`https://conference.example.test/api/v1/events/${eventSlug}/schedule`,
					{ headers: { authorization: `Bearer ${created.token}` } },
				),
				{ params: Promise.resolve({ eventSlug }) },
			);

		expect((await request(eventB.slug)).status).toBe(401);
		expect((await request(eventA.slug)).status).toBe(200);
	});
});
