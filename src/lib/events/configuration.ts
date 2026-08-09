import { parseTrackConflictPolicy, validateEventSettings, type TrackConflictPolicy } from "./settings";
import { validateEventScheduleBounds } from "../schedule/date-bounds";
import { parseSavedTaskFormFields, parseTaskFormFields, type TaskFormField } from "../speakers/task-forms";

export type ConfigurationEvent = {
	id: string;
	name: string;
	timezone: string;
	start_day: string | null;
	end_day: string | null;
	day_start_minutes: number;
	day_end_minutes: number;
	slot_duration_minutes: number;
	track_conflict_policy: TrackConflictPolicy;
	notify_on_submission_create: number;
	notify_on_submission_update: number;
};

export type ConfigurationRoom = { id: string; name: string; position: number };
export type ConfigurationTrack = { id: string; name: string; slug: string; position: number };
export type ConfigurationTask = {
	id: string;
	key: string;
	label: string;
	task_kind: "text" | "file" | "form";
	required: number;
	position: number;
	instructions: string | null;
	due_at: number | null;
	form_fields?: TaskFormField[] | null;
};

export type EventConfiguration = {
	event: ConfigurationEvent;
	rooms: ConfigurationRoom[];
	tracks: ConfigurationTrack[];
	tasks: ConfigurationTask[];
	cfp: { id: string; slug: string; title: string; status: "draft" | "open" | "closed"; fieldCount: number } | null;
	review: { id: string; name: string; status: string; criteriaCount: number } | null;
	/** Saved event_message_templates rows; product defaults apply when zero. */
	messageTemplateCount: number;
};

function trimmed(value: unknown, label: string, max = 120): string {
	if (typeof value !== "string") throw new Error(`${label} is required`);
	const result = value.trim();
	if (!result || result.length > max) throw new Error(`${label} must be between 1 and ${max} characters`);
	return result;
}

function activeRows<T>(result: D1Result<T>): T[] { return result.results; }

export async function loadEventConfiguration(db: D1Database, eventId: string): Promise<EventConfiguration> {
	const [event, rooms, tracks, tasks, cfp, review, messageTemplates] = await Promise.all([
		db.prepare(`SELECT id, name, timezone, start_day, end_day, day_start_minutes, day_end_minutes, slot_duration_minutes, track_conflict_policy, notify_on_submission_create, notify_on_submission_update FROM events WHERE id = ?`).bind(eventId).first<ConfigurationEvent>(),
		db.prepare(`SELECT id, name, position FROM event_rooms WHERE event_id = ? AND soft_deleted = 0 ORDER BY position, name`).bind(eventId).all<ConfigurationRoom>(),
		db.prepare(`SELECT id, name, slug, position FROM agenda_tracks WHERE event_id = ? AND soft_deleted = 0 ORDER BY position, name`).bind(eventId).all<ConfigurationTrack>(),
		db.prepare(`SELECT id, key, label, CASE WHEN form_schema_json IS NOT NULL THEN 'form' ELSE task_kind END AS task_kind, required, position, instructions, due_at, form_schema_json FROM task_templates WHERE event_id = ? AND soft_deleted = 0 ORDER BY position, label`).bind(eventId).all<Omit<ConfigurationTask, "form_fields"> & { form_schema_json: string | null }>(),
		db.prepare(`SELECT id, slug, title, status FROM cfp_forms WHERE event_id = ? AND kind = 'public' ORDER BY created_at LIMIT 1`).bind(eventId).first<{ id: string; slug: string; title: string; status: "draft" | "open" | "closed" }>(),
		db.prepare(`SELECT id, name, status FROM evaluation_plans WHERE event_id = ? ORDER BY created_at LIMIT 1`).bind(eventId).first<{ id: string; name: string; status: string }>(),
		db.prepare(`SELECT COUNT(*) AS count FROM event_message_templates WHERE event_id = ?`).bind(eventId).first<{ count: number }>(),
	]);
	if (!event) throw new Error("Event not found");
	const [fieldCount, criteriaCount] = await Promise.all([
		cfp ? db.prepare("SELECT COUNT(*) AS count FROM form_fields WHERE form_id = ? AND soft_deleted = 0").bind(cfp.id).first<{ count: number }>() : null,
		review ? db.prepare("SELECT COUNT(*) AS count FROM evaluation_criteria WHERE plan_id = ? AND soft_deleted = 0").bind(review.id).first<{ count: number }>() : null,
	]);
	return {
		event,
		rooms: activeRows(rooms), tracks: activeRows(tracks), tasks: activeRows(tasks).map((task) => ({ ...task, form_fields: parseSavedTaskFormFields(task.form_schema_json) })),
		cfp: cfp ? { ...cfp, fieldCount: fieldCount?.count ?? 0 } : null,
		review: review ? { ...review, criteriaCount: criteriaCount?.count ?? 0 } : null,
		messageTemplateCount: messageTemplates?.count ?? 0,
	};
}

export type ReadinessItem = { key: string; label: string; complete: boolean; href: string; detail: string };

export function eventReadiness(configuration: EventConfiguration, eventSlug: string): ReadinessItem[] {
	const { event, rooms, tracks, tasks, cfp, review, messageTemplateCount } = configuration;
	const detailCheck = validateEventSettings({ startDay: event.start_day ?? "", endDay: event.end_day ?? "", timezone: event.timezone, dayStartMinutes: event.day_start_minutes, dayEndMinutes: event.day_end_minutes, slotDurationMinutes: event.slot_duration_minutes });
	const base = `/admin/events/${eventSlug}`;
	return [
		{ key: "details", label: "Event details", complete: Boolean(event.name.trim()) && detailCheck.ok, href: `${base}/settings`, detail: detailCheck.ok ? "Dates, timezone, and schedule defaults are set." : "Add valid dates, timezone, and schedule defaults." },
		{ key: "rooms", label: "Rooms", complete: rooms.length > 0, href: `${base}/settings#rooms`, detail: rooms.length ? `${rooms.length} active room${rooms.length === 1 ? "" : "s"}.` : "Add at least one room." },
		{ key: "tracks", label: "Agenda tracks", complete: tracks.length > 0, href: `${base}/settings#tracks`, detail: tracks.length ? `${tracks.length} active track${tracks.length === 1 ? "" : "s"}.` : "Add at least one track." },
		{ key: "cfp", label: "Public CFP", complete: Boolean(cfp && cfp.title.trim() && cfp.fieldCount > 0), href: `${base}/forms`, detail: cfp ? `${cfp.fieldCount} active field${cfp.fieldCount === 1 ? "" : "s"}; ${cfp.status}.` : "Create a public CFP." },
		{ key: "review", label: "Review plan", complete: Boolean(review && review.criteriaCount > 0), href: `${base}/review`, detail: review ? `${review.criteriaCount} active criterion${review.criteriaCount === 1 ? "" : "s"}.` : "Create a review plan and criterion." },
		{ key: "tasks", label: "Speaker tasks", complete: tasks.length > 0, href: `${base}/settings#tasks`, detail: tasks.length ? `${tasks.length} active template${tasks.length === 1 ? "" : "s"}.` : "Add at least one speaker task template." },
		{
			key: "communications",
			label: "Communication templates",
			complete: messageTemplateCount > 0,
			href: `${base}/communications`,
			detail: messageTemplateCount > 0
				? `${messageTemplateCount} custom template${messageTemplateCount === 1 ? "" : "s"} saved.`
				: "Review acceptance, rejection, and portal email copy.",
		},
		{ key: "cfp-open", label: "Open for proposals", complete: cfp?.status === "open", href: `${base}/forms`, detail: cfp?.status === "open" ? "The public CFP is accepting submissions." : "Open the CFP when you are ready to accept submissions." },
	];
}

export async function updateEventConfiguration(db: D1Database, eventId: string, input: Record<string, unknown>): Promise<void> {
	const name = trimmed(input.name, "Event name", 160);
	const startDay = trimmed(input.startDay, "Start date", 10);
	const endDay = trimmed(input.endDay, "End date", 10);
	const timezone = trimmed(input.timezone, "Timezone", 100);
	const dayStartMinutes = typeof input.dayStartMinutes === "number" ? input.dayStartMinutes : Number.NaN;
	const dayEndMinutes = typeof input.dayEndMinutes === "number" ? input.dayEndMinutes : Number.NaN;
	const slotDurationMinutes = typeof input.slotDurationMinutes === "number" ? input.slotDurationMinutes : Number.NaN;
	if (!Number.isInteger(dayStartMinutes) || !Number.isInteger(dayEndMinutes) || !Number.isInteger(slotDurationMinutes)) throw new Error("Schedule defaults must be whole minutes.");
	const valid = validateEventSettings({ startDay, endDay, timezone, dayStartMinutes, dayEndMinutes, slotDurationMinutes, trackConflictPolicy: input.trackConflictPolicy });
	if (!valid.ok) throw new Error(valid.error);
	const trackConflictPolicy = input.trackConflictPolicy === undefined ? null : parseTrackConflictPolicy(input.trackConflictPolicy);
	const notifyOnCreate =
		input.notifyOnSubmissionCreate === undefined
			? null
			: parseNotifyFlag(input.notifyOnSubmissionCreate, "Notify on submission create");
	const notifyOnUpdate =
		input.notifyOnSubmissionUpdate === undefined
			? null
			: parseNotifyFlag(input.notifyOnSubmissionUpdate, "Notify on submission update");
	const existingSlots = await db
		.prepare("SELECT starts_at, ends_at FROM agenda_slots WHERE event_id = ?")
		.bind(eventId)
		.all<{ starts_at: number; ends_at: number }>();
	for (const slot of existingSlots.results) {
		const boundsError = validateEventScheduleBounds(
			{
				timezone,
				start_day: startDay,
				end_day: endDay,
				day_start_minutes: dayStartMinutes,
				day_end_minutes: dayEndMinutes,
				slot_duration_minutes: slotDurationMinutes,
			},
			slot.starts_at,
			slot.ends_at,
		);
		if (boundsError) {
			throw new Error(`Can't save schedule defaults because an existing session ${boundsError.toLowerCase()}.`);
		}
	}
	await db.prepare(`UPDATE events SET name = ?, start_day = ?, end_day = ?, timezone = ?, day_start_minutes = ?, day_end_minutes = ?, slot_duration_minutes = ?, track_conflict_policy = COALESCE(?, track_conflict_policy), notify_on_submission_create = COALESCE(?, notify_on_submission_create), notify_on_submission_update = COALESCE(?, notify_on_submission_update), updated_at = ? WHERE id = ?`)
		.bind(name, startDay, endDay, timezone, dayStartMinutes, dayEndMinutes, slotDurationMinutes, trackConflictPolicy, notifyOnCreate, notifyOnUpdate, Date.now(), eventId).run();
}

function parseNotifyFlag(value: unknown, label: string): number {
	if (typeof value !== "boolean") throw new Error(`${label} must be a boolean`);
	return value ? 1 : 0;
}

export async function createRoom(db: D1Database, eventId: string, rawName: unknown): Promise<void> {
	const name = trimmed(rawName, "Room name");
	const now = Date.now();
	await db.prepare(`INSERT INTO event_rooms (id, event_id, name, position, soft_deleted, created_at, updated_at)
		SELECT ?, ?, ?, COALESCE(MAX(position), -1) + 1, 0, ?, ?
		FROM event_rooms WHERE event_id = ? AND soft_deleted = 0`)
		.bind(crypto.randomUUID(), eventId, name, now, now, eventId).run();
}
export async function updateRoom(db: D1Database, eventId: string, id: unknown, rawName: unknown): Promise<void> {
	const name = trimmed(rawName, "Room name");
	if (typeof id !== "string" || !id) throw new Error("Room id is required");
	const now = Date.now();
	const result = await db.batch([
		db.prepare("UPDATE event_rooms SET name = ?, updated_at = ? WHERE id = ? AND event_id = ? AND soft_deleted = 0").bind(name, now, id, eventId),
		db.prepare("UPDATE agenda_slots SET room_name = ?, updated_at = ? WHERE event_id = ? AND room_id = ?").bind(name, now, eventId, id),
	]);
	if (!result[0]?.meta.changes) throw new Error("Room not found");
}
export async function deleteRoom(db: D1Database, eventId: string, id: unknown): Promise<void> {
	if (typeof id !== "string" || !id) throw new Error("room id is required");
	const scheduled = await db
		.prepare(`SELECT 1
			FROM agenda_slots a
			INNER JOIN submissions s ON s.id = a.submission_id
			WHERE a.event_id = ? AND a.room_id = ? AND s.status IN ('scheduled', 'published')
			LIMIT 1`)
		.bind(eventId, id)
		.first();
	if (scheduled) {
		throw new Error("This room is used by a scheduled or published session. Move or unschedule it before retiring the room.");
	}
	await softDelete(db, "event_rooms", eventId, id, "room");
}

export async function createTrack(db: D1Database, eventId: string, rawName: unknown, rawSlug: unknown): Promise<void> {
	const name = trimmed(rawName, "Track name"); const slug = trackSlug(rawSlug);
	const now = Date.now();
	await db.prepare(`INSERT INTO agenda_tracks (id, event_id, name, slug, position, soft_deleted, created_at, updated_at)
		SELECT ?, ?, ?, ?, COALESCE(MAX(position), -1) + 1, 0, ?, ?
		FROM agenda_tracks WHERE event_id = ? AND soft_deleted = 0`)
		.bind(crypto.randomUUID(), eventId, name, slug, now, now, eventId).run();
}
export async function updateTrack(db: D1Database, eventId: string, id: unknown, rawName: unknown, rawSlug: unknown): Promise<void> {
	const name = trimmed(rawName, "Track name"); const slug = trackSlug(rawSlug); if (typeof id !== "string" || !id) throw new Error("Track id is required");
	const result = await db.prepare("UPDATE agenda_tracks SET name = ?, slug = ?, updated_at = ? WHERE id = ? AND event_id = ? AND soft_deleted = 0").bind(name, slug, Date.now(), id, eventId).run(); if (!result.meta.changes) throw new Error("Track not found");
}
export async function deleteTrack(db: D1Database, eventId: string, id: unknown): Promise<void> { await softDelete(db, "agenda_tracks", eventId, id, "track"); }

export async function createTaskTemplate(db: D1Database, eventId: string, input: Record<string, unknown>): Promise<void> {
	const key = taskKey(input.key); const label = trimmed(input.label, "Task label"); const kind = taskKind(input.kind); const required = input.required === true ? 1 : 0;
	const formSchema = kind === "form" ? JSON.stringify(parseTaskFormFields(input.formFields ?? input.formSchema)) : null;
	const storageKind = kind === "form" ? "text" : kind;
	const instructions = optionalInstructions(input.instructions);
	const dueAt = optionalDueAt(input.dueAt ?? input.due_at);
	const now = Date.now();
	await db.prepare(`INSERT INTO task_templates (id, event_id, key, label, task_kind, required, position, instructions, due_at, form_schema_json, soft_deleted, created_at, updated_at)
		SELECT ?, ?, ?, ?, ?, ?, COALESCE(MAX(position), -1) + 1, ?, ?, ?, 0, ?, ?
		FROM task_templates WHERE event_id = ? AND soft_deleted = 0`)
		.bind(crypto.randomUUID(), eventId, key, label, storageKind, required, instructions, dueAt, formSchema, now, now, eventId).run();
}
export async function updateTaskTemplate(db: D1Database, eventId: string, input: Record<string, unknown>): Promise<void> {
	const label = trimmed(input.label, "Task label"); const kind = taskKind(input.kind); if (typeof input.id !== "string" || !input.id) throw new Error("Task id is required");
	const formSchema = kind === "form" ? JSON.stringify(parseTaskFormFields(input.formFields ?? input.formSchema)) : null;
	const storageKind = kind === "form" ? "text" : kind;
	const instructions = optionalInstructions(input.instructions);
	const dueAt = optionalDueAt(input.dueAt ?? input.due_at);
	const result = await db.prepare("UPDATE task_templates SET label = ?, task_kind = ?, required = ?, instructions = ?, due_at = ?, form_schema_json = ?, updated_at = ? WHERE id = ? AND event_id = ? AND soft_deleted = 0").bind(label, storageKind, input.required === true ? 1 : 0, instructions, dueAt, formSchema, Date.now(), input.id, eventId).run(); if (!result.meta.changes) throw new Error("Task template not found");
}
export async function deleteTaskTemplate(db: D1Database, eventId: string, id: unknown): Promise<void> { await softDelete(db, "task_templates", eventId, id, "task template"); }

export async function reorderConfigurationRows(db: D1Database, eventId: string, kind: "rooms" | "tracks" | "tasks", orderedIds: unknown): Promise<void> {
	if (!Array.isArray(orderedIds) || !orderedIds.every((id) => typeof id === "string" && id)) throw new Error("orderedIds must be an array of ids");
	const table = kind === "rooms" ? "event_rooms" : kind === "tracks" ? "agenda_tracks" : "task_templates";
	const result = await db.prepare(`SELECT id FROM ${table} WHERE event_id = ? AND soft_deleted = 0 ORDER BY position`).bind(eventId).all<{ id: string }>();
	const current = result.results.map((row) => row.id);
	if (current.length !== orderedIds.length || new Set(orderedIds).size !== current.length || orderedIds.some((id) => !current.includes(id))) throw new Error("Reorder must include every active row exactly once");
	const now = Date.now();
	await db.batch([
		...orderedIds.map((id, index) => db.prepare(`UPDATE ${table} SET position = ?, updated_at = ? WHERE id = ? AND event_id = ?`).bind(-1000 - index, now, id, eventId)),
		...orderedIds.map((id, index) => db.prepare(`UPDATE ${table} SET position = ?, updated_at = ? WHERE id = ? AND event_id = ?`).bind(index, now, id, eventId)),
	]);
}

async function softDelete(db: D1Database, table: "event_rooms" | "agenda_tracks" | "task_templates", eventId: string, id: unknown, label: string): Promise<void> {
	if (typeof id !== "string" || !id) throw new Error(`${label} id is required`);
	const active = await db.prepare(`SELECT COUNT(*) AS count FROM ${table} WHERE event_id = ? AND soft_deleted = 0`).bind(eventId).first<{ count: number }>();
	if ((active?.count ?? 0) <= 1) throw new Error(`Keep at least one active ${label}`);
	// Repeat the active-row guard in the mutation so concurrent requests cannot
	// retire the final remaining configuration row between the count and update.
	const result = await db.prepare(`UPDATE ${table} SET soft_deleted = 1, updated_at = ? WHERE id = ? AND event_id = ? AND soft_deleted = 0 AND (SELECT COUNT(*) FROM ${table} WHERE event_id = ? AND soft_deleted = 0) > 1`).bind(Date.now(), id, eventId, eventId).run();
	if (!result.meta.changes) throw new Error(`${label[0]!.toUpperCase()}${label.slice(1)} not found`);
}
function trackSlug(value: unknown): string { const slug = trimmed(value, "Track slug", 64); if (!/^[a-z0-9-]+$/.test(slug)) throw new Error("Track slug must use lowercase letters, numbers, and hyphens"); return slug; }
function taskKey(value: unknown): string { const key = trimmed(value, "Task key", 64); if (!/^[a-z0-9-]+$/.test(key)) throw new Error("Task key must use lowercase letters, numbers, and hyphens"); return key; }
function taskKind(value: unknown): "text" | "file" | "form" { if (value === "text" || value === "file" || value === "form") return value; throw new Error("Task kind must be text, file, or form"); }
function optionalInstructions(value: unknown): string | null {
	if (value == null || value === "") return null;
	if (typeof value !== "string") throw new Error("Instructions must be a string");
	const text = value.trim();
	if (text.length > 5_000) throw new Error("Instructions are too long (max 5000 characters)");
	return text || null;
}
function optionalDueAt(value: unknown): number | null {
	if (value == null || value === "") return null;
	if (typeof value === "number") {
		if (!Number.isFinite(value) || !Number.isInteger(value)) throw new Error("Due date must be an integer timestamp");
		return value;
	}
	if (typeof value !== "string") throw new Error("Due date must be a timestamp or datetime string");
	const trimmedValue = value.trim();
	if (!trimmedValue) return null;
	if (/^\d+$/.test(trimmedValue)) return Number(trimmedValue);
	const parsed = Date.parse(trimmedValue);
	if (!Number.isFinite(parsed)) throw new Error("Due date is invalid");
	return parsed;
}
