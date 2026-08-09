import { DemoEventWriteError, requireWritableEventById } from "@/lib/events/writability";

export type SpeakerActionAssignment = {
	id: string;
	taskId: string;
	eventId: string;
	personId: string;
	title: string;
	instructions: string | null;
	dueAt: number | null;
	status: "pending" | "completed";
	completedAt: number | null;
	speakerName: string;
	speakerEmail: string;
};

export function uniqueRecipientIds(values: unknown): string[] | null {
	if (!Array.isArray(values) || values.length === 0 || values.length > 100) return null;
	if (values.some((value) => typeof value !== "string" || !value.trim())) return null;
	return [...new Set(values.map((value) => String(value).trim()))];
}

export function renderSpeakerAnnouncementPreview(subject: string, text: string, speaker: { name: string }, eventName: string, portalUrl: string): { subject: string; text: string } {
	const values: Record<string, string> = { event_name: eventName, submitter_name: speaker.name, portal_url: portalUrl };
	const render = (value: string) => value.replace(/{{([a-z_]+)}}/g, (_match, key: string) => values[key] ?? "");
	return { subject: render(subject), text: render(text) };
}

export async function createSpeakerActionTask(db: D1Database, args: {
	eventId: string; title: string; instructions?: string; dueAt: number | null; personIds: string[]; now?: number;
}): Promise<{ taskId: string; assigned: number }> {
	await requireWritableEventById(db, args.eventId);
	const title = args.title.trim();
	if (!title || title.length > 160) throw new Error("Task title must be between 1 and 160 characters");
	if (args.instructions && args.instructions.length > 4000) throw new Error("Instructions are too long");
	const personIds = uniqueRecipientIds(args.personIds);
	if (!personIds) throw new Error("Choose 1 to 100 speakers");
	if (args.dueAt !== null && !Number.isFinite(args.dueAt)) throw new Error("Enter a valid due date");
	const roster = await db.prepare(`SELECT person_id FROM event_speaker_profiles WHERE event_id = ? AND person_id IN (${personIds.map(() => "?").join(",")})`).bind(args.eventId, ...personIds).all<{ person_id: string }>();
	if (roster.results.length !== personIds.length) throw new Error("Every assignee must belong to this event's speaker roster");
	const now = args.now ?? Date.now();
	const taskId = crypto.randomUUID();
	await db.batch([
		db.prepare("INSERT INTO speaker_action_tasks (id, event_id, title, instructions, due_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)").bind(taskId, args.eventId, title, args.instructions?.trim() || null, args.dueAt, now, now),
		...personIds.map((personId) => db.prepare("INSERT INTO speaker_action_task_assignments (id, event_id, task_id, person_id, status, completed_at, created_at, updated_at) VALUES (?, ?, ?, ?, 'pending', NULL, ?, ?)").bind(crypto.randomUUID(), args.eventId, taskId, personId, now, now)),
	]);
	return { taskId, assigned: personIds.length };
}

export async function listSpeakerActionAssignments(db: D1Database, args: { eventId?: string; personId?: string }): Promise<SpeakerActionAssignment[]> {
	if (!args.eventId && !args.personId) return [];
	const clauses: string[] = [];
	const binds: string[] = [];
	if (args.eventId) { clauses.push("a.event_id = ?"); binds.push(args.eventId); }
	if (args.personId) { clauses.push("a.person_id = ?"); binds.push(args.personId); }
	const result = await db.prepare(`SELECT a.id, a.task_id, a.event_id, a.person_id, a.status, a.completed_at, t.title, t.instructions, t.due_at, p.name, p.email FROM speaker_action_task_assignments a JOIN speaker_action_tasks t ON t.id = a.task_id AND t.event_id = a.event_id JOIN people p ON p.id = a.person_id WHERE ${clauses.join(" AND ")} ORDER BY COALESCE(t.due_at, 9223372036854775807), t.title, p.email`).bind(...binds).all<{ id: string; task_id: string; event_id: string; person_id: string; status: "pending" | "completed"; completed_at: number | null; title: string; instructions: string | null; due_at: number | null; name: string | null; email: string }>();
	return result.results.map((row) => ({ id: row.id, taskId: row.task_id, eventId: row.event_id, personId: row.person_id, title: row.title, instructions: row.instructions, dueAt: row.due_at, status: row.status, completedAt: row.completed_at, speakerName: row.name?.trim() || row.email, speakerEmail: row.email }));
}

export async function completeSpeakerActionAssignment(db: D1Database, args: { assignmentId: string; personId: string; now?: number }): Promise<{ ok: true; eventId: string } | { ok: false; error: string; status: number }> {
	const row = await db.prepare("SELECT id, event_id, person_id, status FROM speaker_action_task_assignments WHERE id = ?").bind(args.assignmentId).first<{ id: string; event_id: string; person_id: string; status: string }>();
	if (!row) return { ok: false, error: "Task not found", status: 404 };
	if (row.person_id !== args.personId) return { ok: false, error: "Forbidden", status: 403 };
	try { await requireWritableEventById(db, row.event_id); } catch (error) { if (error instanceof DemoEventWriteError) return { ok: false, error: "This task is read-only", status: 403 }; throw error; }
	if (row.status !== "completed") {
		const now = args.now ?? Date.now();
		await db.prepare("UPDATE speaker_action_task_assignments SET status = 'completed', completed_at = ?, updated_at = ? WHERE id = ? AND person_id = ? AND status = 'pending'").bind(now, now, row.id, args.personId).run();
	}
	return { ok: true, eventId: row.event_id };
}
