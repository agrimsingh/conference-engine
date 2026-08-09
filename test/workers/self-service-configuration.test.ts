import { env } from "cloudflare:workers";
import { describe, expect, it, vi } from "vitest";
import { createEventWithDefaults } from "@/lib/events/create-event";
import {
	createRoom,
	createTaskTemplate,
	createTrack,
	deleteRoom,
	deleteTaskTemplate,
	deleteTrack,
	loadEventConfiguration,
	reorderConfigurationRows,
	updateEventConfiguration,
} from "@/lib/events/configuration";
import { requireWritableEventBySlug } from "@/lib/events/writability";
import { getEventById, listEventRooms } from "@/lib/db/queries";
import { completeFileTask, completeFormTask, completeTextTask } from "@/lib/speakers/complete-task";
import { acceptSubmission } from "@/lib/speakers/accept";
import { loadOutstandingTasksSnapshot } from "@/lib/tasks/outstanding";
import { sendTaskReminders } from "@/lib/email/reminders";
import type { AccountRow } from "@/lib/db/types";

const now = 1_780_100_000_000;
const owner: AccountRow = { id: "self-service-owner", email: "self-service-owner@test.invalid", name: "Owner", created_at: now, updated_at: now };

describe("self-service configuration", () => {
	it("creates organizer defaults and round-trips every editable configuration surface", async () => {
		await env.DB.prepare("INSERT INTO accounts (id, email, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)").bind(owner.id, owner.email, owner.name, now, now).run();
		const created = await createEventWithDefaults(env.DB, { name: "Self service", slug: "self-service", timezone: "Asia/Singapore", startDay: "2026-10-01", endDay: "2026-10-02" }, owner);
		let configuration = await loadEventConfiguration(env.DB, created.eventId);
		expect(configuration.rooms).toHaveLength(2);
		expect(configuration.tracks).toMatchObject([{ name: "General", slug: "general" }]);
		expect(configuration.tasks).toHaveLength(4);
		expect(configuration.review).toMatchObject({ criteriaCount: 1 });
		expect(configuration.cfp).toMatchObject({ slug: "cfp", fieldCount: 3 });

		await updateEventConfiguration(env.DB, created.eventId, { name: "Updated event", startDay: "2026-10-03", endDay: "2026-10-04", timezone: "Asia/Tokyo", dayStartMinutes: 600, dayEndMinutes: 1140, slotDurationMinutes: 45, trackConflictPolicy: "allow" });
		await createRoom(env.DB, created.eventId, "Workshop");
		await createTrack(env.DB, created.eventId, "Workshops", "workshops");
		await createTaskTemplate(env.DB, created.eventId, { key: "release", label: "Release form", kind: "file", required: false });
		configuration = await loadEventConfiguration(env.DB, created.eventId);
		expect(configuration.event).toMatchObject({ name: "Updated event", timezone: "Asia/Tokyo", day_start_minutes: 600, day_end_minutes: 1140, slot_duration_minutes: 45, track_conflict_policy: "allow" });
		expect(await getEventById(env.DB, created.eventId)).toMatchObject({ track_conflict_policy: "allow" });
		expect(configuration.rooms.map((room) => room.name)).toContain("Workshop");
		expect(configuration.tracks.map((track) => track.slug)).toContain("workshops");
		expect(configuration.tasks.find((task) => task.key === "release")).toMatchObject({ label: "Release form", required: 0 });
		await reorderConfigurationRows(env.DB, created.eventId, "tracks", configuration.tracks.map((track) => track.id).reverse());
		expect((await loadEventConfiguration(env.DB, created.eventId)).tracks.map((track) => track.slug)).toEqual(["workshops", "general"]);
	});

	it("appends after the highest active position and keeps concurrent track positions unique", async () => {
		await env.DB.batch([
			env.DB.prepare("INSERT INTO events (id, slug, name, timezone, created_at, updated_at) VALUES ('self-positions', 'self-positions', 'Positions', 'UTC', ?, ?)").bind(now, now),
			env.DB.prepare("INSERT INTO agenda_tracks (id, event_id, name, slug, position, created_at, updated_at) VALUES ('positions-first', 'self-positions', 'First', 'first', 0, ?, ?)").bind(now, now),
			env.DB.prepare("INSERT INTO agenda_tracks (id, event_id, name, slug, position, created_at, updated_at) VALUES ('positions-second', 'self-positions', 'Second', 'second', 1, ?, ?)").bind(now, now),
			env.DB.prepare("INSERT INTO event_rooms (id, event_id, name, position, created_at, updated_at) VALUES ('positions-live-room', 'self-positions', 'Live', 0, ?, ?)").bind(now, now),
			env.DB.prepare("INSERT INTO event_rooms (id, event_id, name, position, soft_deleted, created_at, updated_at) VALUES ('positions-retired-room', 'self-positions', 'Retired', 1, 1, ?, ?)").bind(now, now),
		]);
		await deleteTrack(env.DB, "self-positions", "positions-first");
		await createTrack(env.DB, "self-positions", "Third", "third");
		expect((await loadEventConfiguration(env.DB, "self-positions")).tracks.map((track) => [track.slug, track.position])).toEqual([["second", 1], ["third", 2]]);
		await Promise.all(
			Array.from({ length: 8 }, (_, index) =>
				createTrack(env.DB, "self-positions", `Concurrent ${index}`, `concurrent-${index}`),
			),
		);
		const concurrentTracks = (await loadEventConfiguration(env.DB, "self-positions")).tracks
			.filter((track) => track.slug.startsWith("concurrent-"));
		expect(new Set(concurrentTracks.map((track) => track.position)).size).toBe(8);
		expect((await listEventRooms(env.DB, "self-positions")).map((room) => room.name)).toEqual(["Live"]);
	});

	it("rejects schedule defaults that invalidate existing slots and rooms used by public sessions", async () => {
		await env.DB.batch([
			env.DB.prepare("INSERT INTO events (id, slug, name, timezone, start_day, end_day, day_start_minutes, day_end_minutes, slot_duration_minutes, created_at, updated_at) VALUES ('self-schedule-guards', 'self-schedule-guards', 'Schedule guards', 'UTC', '2026-10-01', '2026-10-02', 540, 1080, 30, ?, ?)").bind(now, now),
			env.DB.prepare("INSERT INTO cfp_forms (id, event_id, slug, title, status, created_at, updated_at) VALUES ('self-schedule-form', 'self-schedule-guards', 'cfp', 'CFP', 'open', ?, ?)").bind(now, now),
			env.DB.prepare("INSERT INTO submissions (id, form_id, event_id, status, answers_json, created_at, updated_at) VALUES ('self-schedule-submission', 'self-schedule-form', 'self-schedule-guards', 'published', '{}', ?, ?)").bind(now, now),
			env.DB.prepare("INSERT INTO event_rooms (id, event_id, name, position, created_at, updated_at) VALUES ('self-schedule-main', 'self-schedule-guards', 'Main', 0, ?, ?)").bind(now, now),
			env.DB.prepare("INSERT INTO event_rooms (id, event_id, name, position, created_at, updated_at) VALUES ('self-schedule-side', 'self-schedule-guards', 'Side', 1, ?, ?)").bind(now, now),
			env.DB.prepare("INSERT INTO agenda_slots (id, event_id, submission_id, room_id, room_name, starts_at, ends_at, ics_uid, created_at, updated_at) VALUES ('self-schedule-slot', 'self-schedule-guards', 'self-schedule-submission', 'self-schedule-main', 'Main', ?, ?, 'self-schedule-slot@example.test', ?, ?)")
				.bind(Date.parse("2026-10-02T10:00:00Z"), Date.parse("2026-10-02T10:30:00Z"), now, now),
		]);
		const base = { name: "Schedule guards", startDay: "2026-10-01", endDay: "2026-10-02", timezone: "UTC", dayStartMinutes: 540, dayEndMinutes: 1080, slotDurationMinutes: 30 };
		await expect(updateEventConfiguration(env.DB, "self-schedule-guards", { ...base, endDay: "2026-10-01" })).rejects.toThrow(/existing session.*ends after/i);
		await expect(updateEventConfiguration(env.DB, "self-schedule-guards", { ...base, dayStartMinutes: 660 })).rejects.toThrow(/existing session.*daily schedule/i);
		await expect(deleteRoom(env.DB, "self-schedule-guards", "self-schedule-main")).rejects.toThrow(/scheduled or published session/i);
		expect(await getEventById(env.DB, "self-schedule-guards")).toMatchObject({ end_day: "2026-10-02", day_start_minutes: 540 });
	});

	it("completes custom materialized task snapshots without a registry key", async () => {
		await env.DB.batch([
			env.DB.prepare("INSERT INTO events (id, slug, name, timezone, created_at, updated_at) VALUES ('self-custom-tasks', 'self-custom-tasks', 'Custom tasks', 'UTC', ?, ?)").bind(now, now),
			env.DB.prepare("INSERT INTO people (id, email, name, created_at) VALUES ('self-custom-person', 'custom@test.invalid', 'Custom', ?)").bind(now),
			env.DB.prepare("INSERT INTO cfp_forms (id, event_id, slug, title, status, created_at, updated_at) VALUES ('self-custom-form', 'self-custom-tasks', 'cfp', 'CFP', 'open', ?, ?)").bind(now, now),
			env.DB.prepare("INSERT INTO submissions (id, form_id, event_id, status, answers_json, created_at, updated_at) VALUES ('self-custom-submission', 'self-custom-form', 'self-custom-tasks', 'accepted', '{}', ?, ?)").bind(now, now),
			env.DB.prepare("INSERT INTO submission_speakers (id, submission_id, person_id, name, email, position, status) VALUES ('self-custom-speaker', 'self-custom-submission', 'self-custom-person', 'Custom', 'custom@test.invalid', 0, 'confirmed')"),
			env.DB.prepare("INSERT INTO speaker_tasks (id, event_id, submission_id, person_id, template_key, template_label, template_task_kind, template_required, status, created_at, updated_at) VALUES ('self-custom-text', 'self-custom-tasks', 'self-custom-submission', 'self-custom-person', 'talk-notes', 'Talk notes', 'text', 1, 'pending', ?, ?)").bind(now, now),
			env.DB.prepare("INSERT INTO speaker_tasks (id, event_id, submission_id, person_id, template_key, template_label, template_task_kind, template_required, status, created_at, updated_at) VALUES ('self-custom-file', 'self-custom-tasks', 'self-custom-submission', 'self-custom-person', 'release-form', 'Release form', 'file', 1, 'pending', ?, ?)").bind(now, now),
		]);
		expect(await completeTextTask(env.DB, { taskId: "self-custom-text", personId: "self-custom-person", text: "Yes" })).toMatchObject({ ok: true });
		expect(await completeFileTask(env.DB, env.FILES, { taskId: "self-custom-file", personId: "self-custom-person", file: new File(["release"], "release.txt", { type: "text/plain" }) })).toMatchObject({ ok: true });
		expect(await env.DB.prepare("SELECT status FROM speaker_tasks WHERE id IN ('self-custom-text', 'self-custom-file') ORDER BY id").all()).toMatchObject({ results: [{ status: "completed" }, { status: "completed" }] });
	});

	it("configures, snapshots, validates, and completes a structured speaker form task", async () => {
		await env.DB.prepare("INSERT INTO accounts (id, email, name, created_at, updated_at) VALUES ('form-task-owner', 'form-task-owner@test.invalid', 'Form owner', ?, ?)").bind(now, now).run();
		const created = await createEventWithDefaults(env.DB, { name: "Structured tasks", slug: "structured-tasks", timezone: "UTC", startDay: "2026-11-01", endDay: "2026-11-01" }, { ...owner, id: "form-task-owner", email: "form-task-owner@test.invalid" });
		await createTaskTemplate(env.DB, created.eventId, {
			key: "travel-details",
			label: "Travel details",
			kind: "form",
			required: true,
			instructions: "Share the details the production team needs.",
			formFields: [
				{ key: "arrival", label: "Arrival time", type: "text", required: true },
				{ key: "diet", label: "Dietary needs", type: "select", required: true, options: ["None", "Vegetarian"] },
				{ key: "notes", label: "Anything else", type: "textarea", required: false },
			],
		});
		const configured = (await loadEventConfiguration(env.DB, created.eventId)).tasks.find((task) => task.key === "travel-details");
		expect(configured).toMatchObject({ task_kind: "form", form_fields: [{ key: "arrival" }, { key: "diet" }, { key: "notes" }] });

		const form = await env.DB.prepare("SELECT id FROM cfp_forms WHERE event_id = ? LIMIT 1").bind(created.eventId).first<{ id: string }>();
		if (!form) throw new Error("missing form");
		await env.DB.batch([
			env.DB.prepare("INSERT INTO submissions (id, form_id, event_id, status, submitter_email, submitter_name, answers_json, created_at, updated_at) VALUES ('structured-submission', ?, ?, 'submitted', 'speaker@structured.test', 'Structured Speaker', '{\"title\":\"Structured talk\"}', ?, ?)").bind(form.id, created.eventId, now, now),
			env.DB.prepare("INSERT INTO submission_speakers (id, submission_id, name, email, position, status) VALUES ('structured-speaker', 'structured-submission', 'Structured Speaker', 'speaker@structured.test', 0, 'confirmed')"),
		]);
		const accepted = await acceptSubmission(env.DB, "structured-submission", { send: false });
		if (!accepted.ok) throw new Error(accepted.error);
		const task = await env.DB.prepare("SELECT id, form_schema_json FROM speaker_tasks WHERE submission_id = 'structured-submission' AND template_key = 'travel-details'").first<{ id: string; form_schema_json: string }>();
		expect(JSON.parse(task?.form_schema_json ?? "[]")).toHaveLength(3);
		if (!task) throw new Error("missing structured task");

		expect(await completeFormTask(env.DB, { taskId: task.id, personId: accepted.speakerPersonIds[0]!, answers: { diet: "Vegetarian" } })).toMatchObject({ ok: false, status: 400, error: "Arrival time is required" });
		expect(await completeFormTask(env.DB, { taskId: task.id, personId: "someone-else", answers: { arrival: "09:30", diet: "None" } })).toMatchObject({ ok: false, status: 403 });
		const completed = await completeFormTask(env.DB, { taskId: task.id, personId: accepted.speakerPersonIds[0]!, answers: { arrival: "09:30", diet: "Vegetarian", notes: "Window seat" } });
		expect(completed).toMatchObject({ ok: true, task: { status: "completed" } });
		expect(JSON.parse(completed.ok ? completed.task.text_value ?? "{}" : "{}")).toEqual({ arrival: "09:30", diet: "Vegetarian", notes: "Window seat" });
	});

	it("counts and reminds only required snapshot tasks using their saved labels", async () => {
		await env.DB.batch([
			env.DB.prepare("INSERT INTO events (id, slug, name, timezone, created_at, updated_at) VALUES ('self-required', 'self-required', 'Required tasks', 'UTC', ?, ?)").bind(now, now),
			env.DB.prepare("INSERT INTO people (id, email, name, created_at) VALUES ('self-required-person', 'required@test.invalid', 'Required', ?)").bind(now),
			env.DB.prepare("INSERT INTO cfp_forms (id, event_id, slug, title, status, created_at, updated_at) VALUES ('self-required-form', 'self-required', 'cfp', 'CFP', 'open', ?, ?)").bind(now, now),
			env.DB.prepare("INSERT INTO submissions (id, form_id, event_id, status, answers_json, created_at, updated_at) VALUES ('self-required-submission', 'self-required-form', 'self-required', 'accepted', '{}', ?, ?)").bind(now, now),
			env.DB.prepare("INSERT INTO speaker_tasks (id, event_id, submission_id, person_id, template_key, template_label, template_task_kind, template_required, status, due_at, created_at, updated_at) VALUES ('self-required-task', 'self-required', 'self-required-submission', 'self-required-person', 'stage-waiver', 'Stage waiver', 'file', 1, 'pending', ?, ?, ?)").bind(now, now, now),
			env.DB.prepare("INSERT INTO speaker_tasks (id, event_id, submission_id, person_id, template_key, template_label, template_task_kind, template_required, status, due_at, created_at, updated_at) VALUES ('self-optional-task', 'self-required', 'self-required-submission', 'self-required-person', 'extra-links', 'Extra links', 'text', 0, 'pending', ?, ?, ?)").bind(now, now, now),
		]);
		const event = await getEventById(env.DB, "self-required");
		expect(event).not.toBeNull();
		const snapshot = await loadOutstandingTasksSnapshot(env.DB, event!);
		expect(snapshot.incompleteCount).toBe(1);
		expect(snapshot.groups[0]?.tasks).toMatchObject([{ templateLabel: "Stage waiver", templateKind: "file", required: true }]);
		const fetchMock = vi.fn(async () => new Response(JSON.stringify({ id: "required-provider" }), { status: 200 }));
		vi.stubGlobal("fetch", fetchMock);
		try {
			const result = await sendTaskReminders({ DB: env.DB, SESSIONS: env.SESSIONS, AUTH_SECRET: "self-required-secret", APP_ORIGIN: "https://conference.example.test", RESEND_API_KEY: "test", RESEND_FROM_EMAIL: "team@example.test" }, { eventId: "self-required", now, dueMode: "due_or_overdue" });
			expect(result).toEqual({ sent: 1, skipped: 0 });
			const [, init] = fetchMock.mock.calls[0] as unknown as [unknown, RequestInit];
			expect(String(init.body)).toContain("Stage waiver");
			expect(String(init.body)).not.toContain("Extra links");
		} finally { vi.unstubAllGlobals(); }
	});

	it("keeps at least one active row and leaves demo events read-only", async () => {
		await env.DB.prepare("INSERT INTO events (id, slug, name, timezone, mode, created_at, updated_at) VALUES ('self-demo', 'self-demo', 'Demo', 'UTC', 'demo', ?, ?)").bind(now, now).run();
		await expect(requireWritableEventBySlug(env.DB, "self-demo")).rejects.toMatchObject({ code: "DEMO_EVENT_READ_ONLY" });
		await env.DB.batch([
			env.DB.prepare("INSERT INTO events (id, slug, name, timezone, created_at, updated_at) VALUES ('self-guards', 'self-guards', 'Guards', 'UTC', ?, ?)").bind(now, now),
			env.DB.prepare("INSERT INTO event_rooms (id, event_id, name, position, created_at, updated_at) VALUES ('guard-room', 'self-guards', 'Main', 0, ?, ?)").bind(now, now),
			env.DB.prepare("INSERT INTO agenda_tracks (id, event_id, name, slug, position, created_at, updated_at) VALUES ('guard-track', 'self-guards', 'General', 'general', 0, ?, ?)").bind(now, now),
			env.DB.prepare("INSERT INTO task_templates (id, event_id, key, label, task_kind, required, position, soft_deleted, created_at, updated_at) VALUES ('guard-task', 'self-guards', 'bio', 'Bio', 'text', 1, 0, 0, ?, ?)").bind(now, now),
		]);
		await expect(deleteRoom(env.DB, "self-guards", "guard-room")).rejects.toThrow("Keep at least one active room");
		await expect(deleteTrack(env.DB, "self-guards", "guard-track")).rejects.toThrow("Keep at least one active track");
		await expect(deleteTaskTemplate(env.DB, "self-guards", "guard-task")).rejects.toThrow("Keep at least one active task template");
	});
});
