import { getDb } from "@/lib/db/cloudflare";

export const DEMO_EVENT_SLUG = "demo-cfp-to-stage";

export type DemoPerspective =
	| "applicant"
	| "organizer"
	| "reviewer"
	| "speaker"
	| "attendee";

export const DEMO_PERSPECTIVES: Array<{
	id: DemoPerspective;
	label: string;
	description: string;
}> = [
	{ id: "applicant", label: "Applicant", description: "See a conditional CFP and its final status." },
	{ id: "organizer", label: "Organizer", description: "Follow the program from intake to publication." },
	{ id: "reviewer", label: "Reviewer", description: "Inspect assigned proposals and rubric scores." },
	{ id: "speaker", label: "Speaker", description: "See accepted sessions and onboarding work." },
	{ id: "attendee", label: "Attendee", description: "Open the published agenda and embeddable schedule." },
];

type EventRow = { id: string; slug: string; name: string; timezone: string; mode: "live" | "demo" };
type FormRow = { title: string; status: string; description: string | null };
type FieldRow = { key: string; label: string; field_type: string; required: number; visibility_rule: string; config: string };
type SubmissionRow = { id: string; status: string; title: string | null; category: string | null; submitter_name: string | null };
type TaskRow = { id: string; status: "pending" | "completed"; template_label: string; speaker: string; title: string | null };
type SlotRow = { starts_at: number; ends_at: number; room_name: string; track: string | null; title: string | null; speaker: string | null };
type ReviewerRow = { id: string; name: string };
type AssignmentRow = { reviewer_id: string; submission_id: string };
type ScoreRow = { reviewer_id: string | null; submission_id: string; score: number; comment: string | null; reviewer: string };
type CriterionRow = { label: string; description: string | null; weight: number };

export type DemoData = {
	event: EventRow;
	form: FormRow;
	fields: FieldRow[];
	submissions: SubmissionRow[];
	statusCounts: Array<{ status: string; count: number }>;
	rooms: string[];
	tracks: string[];
	tasks: TaskRow[];
	slots: SlotRow[];
	reviewers: ReviewerRow[];
	assignments: AssignmentRow[];
	scores: ScoreRow[];
	criteria: CriterionRow[];
};

export async function loadDemoData(): Promise<DemoData | null> {
	const db = await getDb();
	const event = await db
		.prepare("SELECT id, slug, name, timezone, mode FROM events WHERE slug = ? AND mode = 'demo'")
		.bind(DEMO_EVENT_SLUG)
		.first<EventRow>();
	if (!event) return null;

	const [form, fields, submissions, statusCounts, rooms, tracks, tasks, slots, plan] = await Promise.all([
		db.prepare("SELECT title, status, description FROM cfp_forms WHERE event_id = ? AND slug = 'cfp'").bind(event.id).first<FormRow>(),
		db.prepare("SELECT key, label, field_type, required, visibility_rule, config FROM form_fields WHERE form_id = (SELECT id FROM cfp_forms WHERE event_id = ? AND slug = 'cfp') AND soft_deleted = 0 ORDER BY position").bind(event.id).all<FieldRow>(),
		db.prepare("SELECT id, status, json_extract(answers_json, '$.title') AS title, category, submitter_name FROM submissions WHERE event_id = ? ORDER BY created_at DESC").bind(event.id).all<SubmissionRow>(),
		db.prepare("SELECT status, COUNT(*) AS count FROM submissions WHERE event_id = ? GROUP BY status ORDER BY status").bind(event.id).all<{ status: string; count: number }>(),
		db.prepare("SELECT name FROM event_rooms WHERE event_id = ? ORDER BY position, name").bind(event.id).all<{ name: string }>(),
		db.prepare("SELECT name FROM agenda_tracks WHERE event_id = ? AND soft_deleted = 0 ORDER BY position, name").bind(event.id).all<{ name: string }>(),
		db.prepare("SELECT st.id, st.status, st.template_label, COALESCE(ss.name, p.name) AS speaker, json_extract(s.answers_json, '$.title') AS title FROM speaker_tasks st JOIN submissions s ON s.id = st.submission_id LEFT JOIN people p ON p.id = st.person_id LEFT JOIN submission_speakers ss ON ss.submission_id = s.id AND ss.person_id = st.person_id WHERE st.event_id = ? ORDER BY st.status ASC, st.created_at ASC").bind(event.id).all<TaskRow>(),
		db.prepare("SELECT a.starts_at, a.ends_at, a.room_name, t.name AS track, json_extract(s.answers_json, '$.title') AS title, s.submitter_name AS speaker FROM agenda_slots a JOIN submissions s ON s.id = a.submission_id LEFT JOIN agenda_tracks t ON t.id = a.track_id WHERE a.event_id = ? AND s.status IN ('scheduled', 'published') ORDER BY a.starts_at, a.room_name").bind(event.id).all<SlotRow>(),
		db.prepare("SELECT id FROM evaluation_plans WHERE event_id = ? AND status = 'active' LIMIT 1").bind(event.id).first<{ id: string }>(),
	]);
	if (!form) return null;

	const planId = plan?.id ?? "";
	const [reviewers, assignments, scores, criteria] = planId
		? await Promise.all([
			db.prepare("SELECT r.id, r.name FROM reviewers r LEFT JOIN review_assignments ra ON ra.reviewer_id = r.id WHERE r.plan_id = ? GROUP BY r.id ORDER BY COUNT(ra.id) DESC, r.name ASC").bind(planId).all<ReviewerRow>(),
			db.prepare("SELECT reviewer_id, submission_id FROM review_assignments WHERE plan_id = ?").bind(planId).all<AssignmentRow>(),
			db.prepare("SELECT es.reviewer_id, es.submission_id, es.score, es.comment, COALESCE(r.name, es.scored_by) AS reviewer FROM evaluation_scores es LEFT JOIN reviewers r ON r.id = es.reviewer_id WHERE es.plan_id = ? ORDER BY es.updated_at DESC").bind(planId).all<ScoreRow>(),
			db.prepare("SELECT label, description, weight FROM evaluation_criteria WHERE plan_id = ? AND soft_deleted = 0 ORDER BY position").bind(planId).all<CriterionRow>(),
		])
		: [{ results: [] }, { results: [] }, { results: [] }, { results: [] }];

	return {
		event,
		form,
		fields: fields.results,
		submissions: submissions.results,
		statusCounts: statusCounts.results,
		rooms: rooms.results.map((room) => room.name),
		tracks: tracks.results.map((track) => track.name),
		tasks: tasks.results,
		slots: slots.results,
		reviewers: reviewers.results,
		assignments: assignments.results,
		scores: scores.results,
		criteria: criteria.results,
	};
}

export function demoTitle(row: { title: string | null }): string {
	return row.title?.trim() || "Untitled proposal";
}

export function demoTime(value: number, timezone: string): string {
	return new Intl.DateTimeFormat("en-SG", {
		timeZone: timezone,
		hour: "numeric",
		minute: "2-digit",
	}).format(value);
}

export function demoDay(value: number, timezone: string): string {
	return new Intl.DateTimeFormat("en-SG", {
		timeZone: timezone,
		weekday: "short",
		month: "short",
		day: "numeric",
	}).format(value);
}

export function visibilityDescription(rule: string): string {
	try {
		const parsed = JSON.parse(rule) as { op?: string; fieldKey?: string; value?: string; values?: string[] };
		if (parsed.op === "always") return "Asked for every proposal";
		if (parsed.op === "eq") return `Shown when ${parsed.fieldKey?.replaceAll("_", " ") ?? "a prior answer"} is ${parsed.value ?? "selected"}`;
		if (parsed.op === "in") return `Shown for ${parsed.values?.join(", ") ?? "selected"} formats`;
	} catch {
		// The stored rule is internal data. A safe fallback keeps the demo usable.
	}
	return "Shown when the proposal needs it";
}
