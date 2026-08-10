import { NextResponse } from "next/server";
import { requireV1ReadAccess } from "@/lib/auth/public-api";
import { getDb } from "@/lib/db/cloudflare";
import { getEventBySlug } from "@/lib/db/queries";
import { listEventSpeakerRoster } from "@/lib/speakers/roster";

type RouteContext = {
	params: Promise<{ eventSlug: string }>;
};

type SpeakerTaskResourceRow = {
	task_id: string;
	asset_id: string | null;
	filename: string | null;
	content_type: string | null;
	uploaded_at: number | null;
};

type SpeakerTaskResource = {
	readonly id: string;
	readonly filename: string | null;
	readonly contentType: string | null;
	readonly uploadedAt: number | null;
};

function taskResource(row: SpeakerTaskResourceRow): SpeakerTaskResource | null {
	if (!row.asset_id) return null;
	return {
		id: row.asset_id,
		filename: row.filename,
		contentType: row.content_type,
		uploadedAt: row.uploaded_at,
	};
}

export async function GET(request: Request, context: RouteContext) {
	const { eventSlug } = await context.params;
	const auth = await requireV1ReadAccess(request, eventSlug);
	if (!auth.ok) return auth.response;

	const db = await getDb();
	const event = await getEventBySlug(db, eventSlug);
	if (!event) {
		return NextResponse.json({ ok: false, error: "Event not found" }, { status: 404 });
	}

	const [speakers, taskResources] = await Promise.all([
		listEventSpeakerRoster(db, event.id),
		db
			.prepare(
				`SELECT st.id AS task_id, a.id AS asset_id, a.filename, a.content_type, a.created_at AS uploaded_at
				 FROM speaker_tasks st
				 LEFT JOIN assets a ON a.id = st.asset_id AND a.event_id = st.event_id
				 WHERE st.event_id = ?`,
			)
			.bind(event.id)
			.all<SpeakerTaskResourceRow>(),
	]);
	const resourcesByTaskId = new Map(
		taskResources.results.map((row) => [row.task_id, taskResource(row)]),
	);

	return NextResponse.json({
		ok: true,
		event: {
			id: event.id,
			slug: event.slug,
			name: event.name,
			timezone: event.timezone,
		},
		speakers: speakers.map((speaker) => ({
			personId: speaker.personId,
			name: speaker.name,
			email: speaker.email,
			workflowStatus: speaker.workflowStatus,
			profile: {
				bio: speaker.bio,
				jobTitle: speaker.jobTitle,
				company: speaker.company,
				socials: speaker.socials,
				headshot: speaker.headshot,
			},
			submissionIds: speaker.submissionIds,
			submissionStatuses: speaker.submissionStatuses,
			tasks: speaker.tasks.map((task) => ({
				id: task.id,
				key: task.templateKey,
				label: task.label,
				status: task.status,
				dueAt: task.dueAt,
				submissionId: task.submissionId,
				resource: resourcesByTaskId.get(task.id) ?? null,
			})),
		})),
	});
}
