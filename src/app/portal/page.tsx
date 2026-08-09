import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/ui";
import { getDb } from "@/lib/db/cloudflare";
import { listDeliverableBundles } from "@/lib/content/deliverables";
import {
	listEventsByIds,
	getAgendaSlotBySubmission,
	getSpeakerProfile,
	listSubmissionsForPerson,
	listSpeakersForSubmissions,
	listTasksForPerson,
} from "@/lib/db/queries";
import { SPEAKER_TASK_TYPE_REGISTRY, isSpeakerTaskKey } from "@/lib/domain";
import { parseSpeakerSocial } from "@/lib/speakers/social";
import { readPortalSessionFromCookie } from "@/lib/speakers/portal-session";
import { PortalLoginForm } from "./portal-login-form";
import { TaskChecklist } from "./task-checklist";
import { parseSavedTaskFormFields } from "@/lib/speakers/task-forms";
import { ProfileEditor } from "./profile-editor";
import { ActionTaskList } from "./action-task-list";
import { listSpeakerActionAssignments } from "@/lib/speakers/operations";
import { listPublishedPortalResourcesForSpeaker } from "@/lib/resources/resources";
import { PortalResourceList } from "./portal-resource-list";

type Props = {
	searchParams: Promise<{ email?: string; error?: string }>;
};

export default async function PortalPage({ searchParams }: Props) {
	const params = await searchParams;
	const session = await readPortalSessionFromCookie();
	if (!session) {
		return (
			<main className="mx-auto max-w-lg px-4 py-10">
				<PageHeader
					eyebrow="Speaker portal"
					title="Sign in"
					description="Enter the email used on any proposal. We'll email a one-time sign-in link — check your inbox (and spam) for conference-engine."
				/>
				<PortalLoginForm initialEmail={params.email ?? ""} />
				<p className="mt-8 text-sm text-neutral-500">
					<Link
						className="underline underline-offset-2 hover:text-neutral-300"
						href="/"
					>
						← Home
					</Link>
				</p>
			</main>
		);
	}

	const db = await getDb();
	const submissions = await listSubmissionsForPerson(db, session.personId);
	const tasks = await listTasksForPerson(db, session.personId);
	const deliverables = await listDeliverableBundles(db, { personId: session.personId });
	const [actionTasks, portalResources] = await Promise.all([
		listSpeakerActionAssignments(db, { personId: session.personId }),
		listPublishedPortalResourcesForSpeaker(db, session.personId),
	]);

	const profileEvents = await db.prepare("SELECT event_id FROM event_speaker_profiles WHERE person_id = ?").bind(session.personId).all<{ event_id: string }>();
	const eventRows = await listEventsByIds(db, [...submissions.map((submission) => submission.event_id), ...profileEvents.results.map((row) => row.event_id)]);
	const events = new Map(eventRows.map((event) => [event.id, event]));
	const [speakersBySubmission, profiles, slots] = await Promise.all([
		listSpeakersForSubmissions(db, submissions.map((submission) => submission.id)),
		Promise.all(eventRows.map(async (event) => [event.id, await getSpeakerProfile(db, event.id, session.personId)] as const)),
		Promise.all(submissions.map(async (submission) => [submission.id, await getAgendaSlotBySubmission(db, submission.id)] as const)),
	]);
	const profilesByEvent = new Map(profiles);
	const slotsBySubmission = new Map(slots);
	const firstSubmissionIdByEvent = new Map<string, string>();
	for (const submission of submissions) {
		if (!firstSubmissionIdByEvent.has(submission.event_id)) firstSubmissionIdByEvent.set(submission.event_id, submission.id);
	}

	const requiredTasks = tasks.filter((task) => task.template_required !== 0);
	const completedCount = requiredTasks.filter((task) => task.status === "completed").length;
	const portalDescription = submissions.length === 0
		? "Every proposal tied to this email will show here, and accepted talks include their onboarding work."
		: tasks.length > 0
			? `${completedCount}/${requiredTasks.length} required onboarding tasks complete.`
			: `${submissions.length} proposal${submissions.length === 1 ? "" : "s"} on file. We’ll show speaker materials here when they’re ready.`;

	return (
		<main className="mx-auto max-w-2xl px-4 py-10">
		<PageHeader
				eyebrow="Speaker portal"
				title={session.email}
				description={portalDescription}
		/>
			{actionTasks.length ? <section className="mb-10"><h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-neutral-500">Your action tasks</h2><ActionTaskList tasks={actionTasks} readOnlyEventIds={eventRows.filter((event) => event.mode === "demo").map((event) => event.id)} /></section> : null}
			{eventRows.map((event) => {
				const resources = portalResources.filter((resource) => resource.event_id === event.id);
				return resources.length ? <section key={event.id} className="mb-10"><h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-neutral-500">{event.name} resources</h2><PortalResourceList resources={resources} /></section> : null;
			})}
			{eventRows.filter((event) => !firstSubmissionIdByEvent.has(event.id)).map((event) => { const profile = profilesByEvent.get(event.id); return <section key={event.id} className="mb-10 rounded-lg border border-neutral-800 bg-neutral-900 p-4"><p className="font-medium text-neutral-100">{event.name}</p><p className="mb-3 mt-1 text-xs text-neutral-500">Speaker profile</p>{event.mode !== "demo" ? <ProfileEditor eventId={event.id} displayName={profile?.display_name ?? session.email} bio={profile?.bio ?? ""} jobTitle={profile?.job_title ?? ""} company={profile?.company ?? ""} social={parseSpeakerSocial(profile?.social_json)} hasHeadshot={Boolean(profile?.headshot_asset_id)} /> : null}</section>; })}

			<section className="mb-10 space-y-3">
						<h2 className="text-sm font-medium uppercase tracking-wide text-neutral-500">
							Your submissions
				</h2>
				{submissions.length === 0 ? (
					<EmptyState
							title="No submissions yet"
							description="Use the email from your proposal, then request another sign-in link if needed."
					/>
				) : (
						<ul className="space-y-3">
							{submissions.map((row) => {
								const answers = parseAnswers(row.answers_json);
								const submissionTasks = tasks.filter((task) => task.submission_id === row.id);
								const requiredSubmissionTasks = submissionTasks.filter((task) => task.template_required !== 0);
								const completed = requiredSubmissionTasks.filter((task) => task.status === "completed").length;
									return (
										<li key={row.id} className="rounded-lg border border-neutral-800 bg-neutral-900 px-4 py-4 text-sm">
											<p className="font-medium text-neutral-100">
												{typeof answers.title === "string" ? answers.title : "(untitled)"}
											</p>
											<p className="mt-1 text-neutral-400">
											{events.get(row.event_id)?.name ?? "Event"} ·{" "}
											{row.status.replaceAll("_", " ")}
										</p>
										{row.status === "accepted" || row.status === "scheduled" || row.status === "published" ? (() => {
											const slot = slotsBySubmission.get(row.id);
											const event = events.get(row.event_id);
											return <p className="mt-1 text-xs text-neutral-500">{slot ? `${slot.room_name} · ${formatEventTime(slot.starts_at, event?.timezone)}` : "Accepted session · schedule pending"}</p>;
										})() : null}
										{(() => {
											const speakers = speakersBySubmission.get(row.id) ?? [];
											return speakers.length > 1 ? <div className="mt-3 border-t border-neutral-800 pt-3"><p className="text-xs font-medium uppercase tracking-wide text-neutral-500">Co-speakers and invitation history</p><ul className="mt-2 space-y-1 text-xs text-neutral-400">{speakers.filter((speaker) => speaker.position > 0).map((speaker) => <li key={speaker.id}>{speaker.name || speaker.email} · {speaker.status}{speaker.invited_at ? ` · invited ${new Date(speaker.invited_at).toISOString().slice(0, 10)}` : " · invite not sent"}{speaker.confirmed_at ? ` · confirmed ${new Date(speaker.confirmed_at).toISOString().slice(0, 10)}` : ""}</li>)}</ul></div> : null;
										})()}
										{(() => {
											const event = events.get(row.event_id);
											const profile = profilesByEvent.get(row.event_id);
											if (!event || event.mode === "demo" || firstSubmissionIdByEvent.get(row.event_id) !== row.id) return null;
											return (
												<div className="mt-3">
													<ProfileEditor
														eventId={event.id}
														displayName={profile?.display_name ?? session.email}
														bio={profile?.bio ?? ""}
														jobTitle={profile?.job_title ?? ""}
														company={profile?.company ?? ""}
												social={parseSpeakerSocial(profile?.social_json)}
												hasHeadshot={Boolean(profile?.headshot_asset_id)}
													/>
												</div>
											);
										})()}
										{row.status === "accepted" || row.status === "scheduled" || row.status === "published" ? (
											<div className="mt-4 border-t border-neutral-800 pt-3">
												<div className="mb-3 flex items-baseline justify-between gap-3">
													<p className="font-medium text-neutral-200">Speaker materials</p>
													<span className="text-xs text-neutral-500">{completed}/{requiredSubmissionTasks.length} required complete</span>
												</div>
												{submissionTasks.length === 0 ? (
													<p className="text-neutral-500">Materials are being prepared by the organizers.</p>
												) : (
														<TaskChecklist
															compact
															timeZone={events.get(row.event_id)?.timezone}
															tasks={submissionTasks.map((task) => {
															const meta = isSpeakerTaskKey(task.template_key) ? SPEAKER_TASK_TYPE_REGISTRY[task.template_key] : null;
															return {
																id: task.id,
																key: task.template_key,
																label: task.template_label || meta?.label || task.template_key,
																		kind: task.form_schema_json ? "form" : task.template_task_kind ?? meta?.kind ?? "file",
																		formFields: parseSavedTaskFormFields(task.form_schema_json),
																status: task.status,
																accept: meta?.accept ?? [],
																textValue: task.text_value,
																assetId: task.asset_id,
																required: task.template_required !== 0,
																instructions: task.instructions ?? null,
														dueAt: task.due_at ?? null,
														versions: (deliverables.get(task.id)?.versions ?? []).map((version) => ({ id: version.id, versionNumber: version.version_number, filename: version.filename, sizeBytes: version.size_bytes, createdAt: version.created_at })),
														comments: (deliverables.get(task.id)?.comments ?? []).map((comment) => ({ id: comment.id, authorName: comment.author_name, authorKind: comment.author_kind, body: comment.body, createdAt: comment.created_at })),
													};
																																					})}
															readOnly={events.get(row.event_id)?.mode === "demo"}
														/>
												)}
											</div>
										) : null}
										</li>
							);
						})}
					</ul>
				)}
			</section>
		</main>
	);
}

function parseAnswers(raw: string): Record<string, unknown> {
	try {
		const parsed: unknown = JSON.parse(raw);
		if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
			return parsed as Record<string, unknown>;
		}
	} catch {
		// ignore
	}
	return {};
}

function formatEventTime(value: number, timeZone?: string): string {
	try {
		return new Intl.DateTimeFormat(undefined, {
			timeZone: timeZone || "UTC",
			dateStyle: "medium",
			timeStyle: "short",
		}).format(new Date(value));
	} catch {
		return new Date(value).toISOString();
	}
}
