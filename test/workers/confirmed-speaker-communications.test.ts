import { env } from "cloudflare:workers";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import {
	notifyCalendarCancellation,
	notifyCalendarInvite,
	notifyConfirmedSpeakerLifecycle,
	formatCalendarEmailInterval,
} from "@/lib/email/notify";

const now = 1_781_900_000_000;
const runtime = {
	authSecret: "confirmed-speaker-test-secret",
	resendApiKey: "test-key",
	resendFromEmail: "team@example.test",
};

async function seed() {
	await env.DB.batch([
		env.DB.prepare("INSERT INTO events (id, slug, name, timezone, created_at, updated_at) VALUES ('comms-event', 'comms-event', 'Comms Event', 'UTC', ?, ?)").bind(now, now),
		env.DB.prepare("INSERT INTO cfp_forms (id, event_id, slug, title, status, created_at, updated_at) VALUES ('comms-form', 'comms-event', 'cfp', 'CFP', 'open', ?, ?)").bind(now, now),
		env.DB.prepare("INSERT INTO submissions (id, form_id, event_id, status, submitter_email, submitter_name, answers_json, created_at, updated_at) VALUES ('comms-submission', 'comms-form', 'comms-event', 'accepted', 'primary@example.test', 'Primary Person', '{\"title\":\"Shared session\"}', ?, ?)").bind(now, now),
		env.DB.prepare("INSERT INTO submission_speakers (id, submission_id, name, email, position, status) VALUES ('comms-primary', 'comms-submission', 'Primary Person', 'primary@example.test', 0, 'confirmed')"),
		env.DB.prepare("INSERT INTO submission_speakers (id, submission_id, name, email, position, status) VALUES ('comms-confirmed', 'comms-submission', 'Confirmed Co-speaker', 'confirmed@example.test', 1, 'confirmed')"),
		env.DB.prepare("INSERT INTO submission_speakers (id, submission_id, name, email, position, status) VALUES ('comms-pending', 'comms-submission', 'Pending Co-speaker', 'pending@example.test', 2, 'pending')"),
		env.DB.prepare("INSERT INTO submission_speakers (id, submission_id, name, email, position, status) VALUES ('comms-declined', 'comms-submission', 'Declined Co-speaker', 'declined@example.test', 3, 'declined')"),
	]);
}

function sentMessages(fetchMock: ReturnType<typeof vi.fn>) {
	return fetchMock.mock.calls.map(([, init]) => JSON.parse(String((init as RequestInit).body)) as {
		to: string[];
		subject: string;
		text: string;
		attachments?: Array<{ content: string }>;
	});
}

describe("confirmed-speaker communications", () => {
	beforeAll(seed);
	afterEach(() => vi.unstubAllGlobals());

	it("formats the email interval in the event timezone, including DST-aware offsets", () => {
		expect(
			formatCalendarEmailInterval(
				Date.parse("2026-09-17T02:00:00Z"),
				Date.parse("2026-09-17T02:30:00Z"),
				"Asia/Singapore",
			),
		).toEqual({
			startsAt: "Thu, 17 Sept 2026, 10:00 am",
			endsAt: "10:30 am SGT",
		});
		const winter = formatCalendarEmailInterval(
			Date.parse("2026-01-15T15:00:00Z"),
			Date.parse("2026-01-15T15:30:00Z"),
			"America/New_York",
		);
		const summer = formatCalendarEmailInterval(
			Date.parse("2026-07-15T14:00:00Z"),
			Date.parse("2026-07-15T14:30:00Z"),
			"America/New_York",
		);
		expect(winter.startsAt).toMatch(/10:00 am$/);
		expect(summer.startsAt).toMatch(/10:00 am$/);
		expect(winter.endsAt.slice("10:30 am ".length)).not.toBe(
			summer.endsAt.slice("10:30 am ".length),
		);
	});

	it("sends personalized acceptance email to every confirmed speaker only", async () => {
		const fetchMock = vi.fn(async () => new Response(JSON.stringify({ id: crypto.randomUUID() }), { status: 200 }));
		vi.stubGlobal("fetch", fetchMock);

		const results = await notifyConfirmedSpeakerLifecycle(env.DB, {
			submissionId: "comms-submission",
			templateKey: "acceptance",
			override: { subject: "You're in", text: "Hi Primary Person,\n\nYour session was accepted." },
			portalUrl: "https://conference.example.test/portal",
			force: true,
			runtime,
		});

		expect(results).toHaveLength(2);
		const sent = sentMessages(fetchMock);
		expect(sent.map((message) => message.to[0]).sort()).toEqual(["confirmed@example.test", "primary@example.test"]);
		expect(sent.find((message) => message.to[0] === "confirmed@example.test")?.text).toContain("Hi Confirmed Co-speaker");
		for (const message of sent) {
			const urls = message.text.match(/https?:\/\/\S+/g) ?? [];
			expect(urls).toHaveLength(1);
			expect(new URL(urls[0] ?? "https://invalid.test").pathname).toBe("/portal");
		}
		expect(JSON.stringify(sent)).not.toContain("pending@example.test");
		expect(JSON.stringify(sent)).not.toContain("declined@example.test");
	});

	it("sends recipient-specific calendar requests and cancellations to every confirmed speaker", async () => {
		const fetchMock = vi.fn(async () => new Response(JSON.stringify({ id: crypto.randomUUID() }), { status: 200 }));
		vi.stubGlobal("fetch", fetchMock);
		const calendar = {
			submissionId: "comms-submission",
			roomName: "Main stage",
			startsAtMs: Date.parse("2030-06-01T10:00:00Z"),
			endsAtMs: Date.parse("2030-06-01T10:30:00Z"),
			icsUid: "shared-session@example.test",
			sequence: 2,
			fromEmail: "team@example.test",
			appOrigin: "https://conference.example.test",
			runtime,
		};

		await env.DB.prepare("UPDATE events SET timezone = 'Asia/Singapore' WHERE id = 'comms-event'").run();
		const invite = await notifyCalendarInvite(env.DB, calendar);
		expect(invite.emails).toHaveLength(2);
		let sent = sentMessages(fetchMock);
		expect(sent).toHaveLength(2);
		expect(sent.map((message) => message.to[0]).sort()).toEqual(["confirmed@example.test", "primary@example.test"]);
		for (const message of sent) {
			expect(message.text).not.toContain("2030-06-01T10:00:00.000Z");
			expect(message.text).not.toContain("2030-06-01T10:30:00.000Z");
			expect(message.text).toContain("Sat, 1 Jun 2030, 6:00 pm → 6:30 pm SGT");
			const ics = atob(message.attachments?.[0]?.content ?? "").replace(/\r\n /g, "");
			expect(ics).toContain("METHOD:REQUEST");
			expect(ics).toContain("UID:shared-session@example.test");
			expect(ics).toContain(`ATTENDEE;CN=${message.to[0]};`);
			expect(ics).toContain(`mailto:${message.to[0]}`);
			expect(ics).toContain("ORGANIZER;CN=Comms Event:mailto:team@example.test");
		}

		fetchMock.mockClear();
		const cancellation = await notifyCalendarCancellation(env.DB, calendar);
		expect(cancellation.emails).toHaveLength(2);
		sent = sentMessages(fetchMock);
		expect(sent).toHaveLength(2);
		for (const message of sent) {
			const ics = atob(message.attachments?.[0]?.content ?? "").replace(/\r\n /g, "");
			expect(ics).toContain("METHOD:CANCEL");
			expect(ics).toContain("SEQUENCE:2");
		}

		const deliveries = await env.DB.prepare("SELECT to_email, status FROM email_deliveries WHERE submission_id = ? ORDER BY to_email, created_at").bind("comms-submission").all<{ to_email: string; status: string }>();
		expect(deliveries.results).toHaveLength(6);
		expect(new Set(deliveries.results.map((row) => row.to_email))).toEqual(new Set(["primary@example.test", "confirmed@example.test"]));
		expect(deliveries.results.every((row) => row.status === "sent")).toBe(true);
	});
});
