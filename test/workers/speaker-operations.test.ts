import { env } from "cloudflare:test";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { sendTaskReminders } from "@/lib/email/reminders";
import { resolveSpeakerHeadshot, uploadSpeakerHeadshot } from "@/lib/speakers/headshot";
import { completeSpeakerActionAssignment, createSpeakerActionTask, listSpeakerActionAssignments } from "@/lib/speakers/operations";
import { listEventSpeakerRoster, upsertEventSpeakerProfile, validateRosterRecipientSelection } from "@/lib/speakers/roster";

describe("speaker operations", () => {
	const now = Date.UTC(2027, 2, 1);
	beforeAll(async () => {
		await env.DB.batch([
			env.DB.prepare("INSERT INTO events (id, slug, name, timezone, mode, created_at, updated_at) VALUES ('spk-event', 'spk-event', 'DevFlow Conf 2027', 'UTC', 'live', ?, ?)").bind(now, now),
			env.DB.prepare("INSERT INTO events (id, slug, name, timezone, mode, created_at, updated_at) VALUES ('spk-other', 'spk-other', 'Other Event', 'UTC', 'live', ?, ?)").bind(now, now),
			env.DB.prepare("INSERT INTO people (id, email, name, created_at) VALUES ('spk-priya', 'priya@spk.test', 'Priya Raman', ?)").bind(now),
			env.DB.prepare("INSERT INTO people (id, email, name, created_at) VALUES ('spk-marcus', 'marcus@spk.test', 'Marcus Okafor', ?)").bind(now),
			env.DB.prepare("INSERT INTO people (id, email, name, created_at) VALUES ('spk-foreign', 'foreign@spk.test', 'Foreign Speaker', ?)").bind(now),
			env.DB.prepare("INSERT INTO speaker_profiles (id, event_id, person_id, display_name, created_at, updated_at) VALUES ('spk-profile-priya', 'spk-event', 'spk-priya', 'Priya Raman', ?, ?)").bind(now, now),
			env.DB.prepare("INSERT INTO speaker_profiles (id, event_id, person_id, display_name, created_at, updated_at) VALUES ('spk-profile-marcus', 'spk-event', 'spk-marcus', 'Marcus Okafor', ?, ?)").bind(now, now),
			env.DB.prepare("INSERT INTO speaker_profiles (id, event_id, person_id, display_name, created_at, updated_at) VALUES ('spk-profile-foreign', 'spk-other', 'spk-foreign', 'Foreign Speaker', ?, ?)").bind(now, now),
			env.DB.prepare("INSERT INTO event_speaker_profiles (id, event_id, person_id, workflow_status, created_at, updated_at) VALUES ('spk-roster-priya', 'spk-event', 'spk-priya', 'confirmed', ?, ?)").bind(now, now),
			env.DB.prepare("INSERT INTO event_speaker_profiles (id, event_id, person_id, workflow_status, created_at, updated_at) VALUES ('spk-roster-marcus', 'spk-event', 'spk-marcus', 'confirmed', ?, ?)").bind(now, now),
			env.DB.prepare("INSERT INTO event_speaker_profiles (id, event_id, person_id, workflow_status, created_at, updated_at) VALUES ('spk-roster-foreign', 'spk-other', 'spk-foreign', 'confirmed', ?, ?)").bind(now, now),
		]);
	});

	it("persists full organizer profile fields in the event roster", async () => {
		const result = await upsertEventSpeakerProfile(env.DB, { eventId: "spk-event", personId: "spk-priya", input: { email: "priya@spk.test", name: "Priya Raman", jobTitle: "Principal Engineer", company: "Latticework Systems", bio: "SBEK-ORG-EDIT-01", logisticsText: "Arrival May 11, aisle seat; dietary: Vegetarian", workflowStatus: "confirmed" }, now });
		expect(result).toMatchObject({ ok: true });
		const priya = (await listEventSpeakerRoster(env.DB, "spk-event")).find((row) => row.personId === "spk-priya");
		expect(priya).toMatchObject({ bio: "SBEK-ORG-EDIT-01", logisticsText: "Arrival May 11, aisle seat; dietary: Vegetarian", jobTitle: "Principal Engineer", company: "Latticework Systems" });
	});

	it("assigns one general task to two same-event speakers, dedupes, and rejects foreign speakers", async () => {
		const created = await createSpeakerActionTask(env.DB, { eventId: "spk-event", title: "Confirm participation", dueAt: Date.UTC(2027, 3, 1), personIds: ["spk-priya", "spk-marcus", "spk-priya"], now });
		expect(created.assigned).toBe(2);
		await expect(createSpeakerActionTask(env.DB, { eventId: "spk-event", title: "Bad assignment", dueAt: null, personIds: ["spk-priya", "spk-foreign"], now })).rejects.toThrow("Every assignee must belong");
		const rows = await listSpeakerActionAssignments(env.DB, { eventId: "spk-event" });
		expect(rows.filter((row) => row.taskId === created.taskId)).toHaveLength(2);
		await expect(env.DB.prepare("INSERT INTO speaker_action_task_assignments (id, event_id, task_id, person_id, status, created_at, updated_at) VALUES ('spk-cross-insert', 'spk-other', ?, 'spk-foreign', 'pending', ?, ?)").bind(created.taskId, now, now).run()).rejects.toThrow("speaker action assignment event mismatch");
		const priya = rows.find((row) => row.taskId === created.taskId && row.personId === "spk-priya")!;
		await expect(env.DB.prepare("UPDATE speaker_action_task_assignments SET event_id = 'spk-other' WHERE id = ?").bind(priya.id).run()).rejects.toThrow("speaker action assignment event mismatch");
	});

	it("rejects an explicit email selection when any recipient belongs to another event", async () => {
		expect(await validateRosterRecipientSelection(env.DB, "spk-event", ["spk-priya", "spk-marcus"])).toBe(true);
		expect(await validateRosterRecipientSelection(env.DB, "spk-event", ["spk-priya", "spk-foreign"])).toBe(false);
	});

	it("allows only the assigned speaker to complete and persists completion", async () => {
		const created = await createSpeakerActionTask(env.DB, { eventId: "spk-event", title: "Complete bio and profile", dueAt: Date.UTC(2027, 3, 1), personIds: ["spk-priya"], now });
		const assignment = (await listSpeakerActionAssignments(env.DB, { personId: "spk-priya" })).find((row) => row.taskId === created.taskId)!;
		expect(await completeSpeakerActionAssignment(env.DB, { assignmentId: assignment.id, personId: "spk-marcus", now })).toMatchObject({ ok: false, status: 403 });
		expect(await completeSpeakerActionAssignment(env.DB, { assignmentId: assignment.id, personId: "spk-priya", now })).toEqual({ ok: true, eventId: "spk-event" });
		expect((await listSpeakerActionAssignments(env.DB, { personId: "spk-priya" })).find((row) => row.id === assignment.id)?.status).toBe("completed");
	});

	it("rejects invalid headshots and round-trips valid image metadata", async () => {
		expect(await uploadSpeakerHeadshot(env.DB, env.FILES, { eventId: "spk-event", personId: "spk-priya", file: new File(["no"], "notes.txt", { type: "text/plain" }) })).toMatchObject({ ok: false, status: 400 });
		const uploaded = await uploadSpeakerHeadshot(env.DB, env.FILES, { eventId: "spk-event", personId: "spk-priya", file: new File([new Uint8Array([137, 80, 78, 71])], "headshot.png", { type: "image/png" }) });
		expect(uploaded).toMatchObject({ ok: true });
		expect(await resolveSpeakerHeadshot(env.DB, { eventId: "spk-event", personId: "spk-priya" })).toMatchObject({ filename: "headshot.png", uploaded_by_person_id: "spk-priya" });
		expect(await resolveSpeakerHeadshot(env.DB, { eventId: "spk-other", personId: "spk-priya" })).toBeNull();
		const replacement = await uploadSpeakerHeadshot(env.DB, env.FILES, { eventId: "spk-event", personId: "spk-priya", file: new File([new Uint8Array([137, 80, 78, 72])], "headshot-new.png", { type: "image/png" }) });
		expect(replacement).toMatchObject({ ok: true });
		expect(await resolveSpeakerHeadshot(env.DB, { eventId: "spk-event", personId: "spk-priya" })).toMatchObject({ filename: "headshot-new.png" });
		expect(await env.DB.prepare("SELECT COUNT(*) AS count FROM assets WHERE event_id = 'spk-event' AND uploaded_by_person_id = 'spk-priya'").first<{ count: number }>()).toEqual({ count: 2 });
	});

	it("automatically reminds only due general actions with the task and due date", async () => {
		await createSpeakerActionTask(env.DB, { eventId: "spk-event", title: "Sign speaker release form", dueAt: now - 1, personIds: ["spk-marcus"], now });
		await createSpeakerActionTask(env.DB, { eventId: "spk-event", title: "Future action", dueAt: now + 86_400_000, personIds: ["spk-marcus"], now });
		const fetchMock = vi.fn(async () => new Response(JSON.stringify({ id: "spk-reminder-provider" }), { status: 200 })); vi.stubGlobal("fetch", fetchMock);
		try {
			expect(await sendTaskReminders({ DB: env.DB, SESSIONS: env.SESSIONS, AUTH_SECRET: "spk-secret", APP_ORIGIN: "https://conference.example.test", RESEND_API_KEY: "test", RESEND_FROM_EMAIL: "team@example.test" }, { eventId: "spk-event", now, dueMode: "due_or_overdue" })).toEqual({ sent: 1, skipped: 0 });
			const [, init] = fetchMock.mock.calls[0] as unknown as [unknown, RequestInit]; const body = String(init.body);
			expect(body).toContain("Sign speaker release form"); expect(body).toContain("2027-02-28"); expect(body).not.toContain("Future action");
		} finally { vi.unstubAllGlobals(); }
	});
});
