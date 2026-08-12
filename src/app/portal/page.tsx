import { Suspense } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { getDb } from "@/lib/db/cloudflare";
import { listDeliverableBundles } from "@/lib/content/deliverables";
import {
	listEventsByIds,
	listAgendaSlotsBySubmissionIds,
	listSpeakerProfilesForPerson,
	listSubmissionsForPerson,
	listSpeakersForSubmissions,
	listTasksForPerson,
} from "@/lib/db/queries";
import {
	SPEAKER_TASK_TYPE_REGISTRY,
	canTransitionSubmission,
	isSpeakerTaskKey,
	isSubmissionStatus,
} from "@/lib/domain";
import { parseSpeakerSocial } from "@/lib/speakers/social";
import { readPortalSessionFromCookie } from "@/lib/speakers/portal-session";
import { parseSavedTaskFormFields } from "@/lib/speakers/task-forms";
import { listSpeakerActionAssignments } from "@/lib/speakers/operations";
import { listHandoffsForSubmissions } from "@/lib/speakers/handoff";
import { slotAckStateForActor } from "@/lib/schedule/slot-ack";
import { listPublishedPortalResourcesForSpeaker } from "@/lib/resources/resources";
import {
	isProfileTaskKey,
	isSessionPrepTaskKey,
	speakerApplicationStatusLabel,
} from "@/lib/speakers/portal-view";
import { PortalLoginForm } from "./portal-login-form";
import {
	PortalConsole,
	type PortalApplication,
	type PortalEventProfile,
	type PortalResourceGroup,
} from "./portal-console";
import type { TaskView } from "./task-checklist";

type Props = {
	searchParams: Promise<{ email?: string; error?: string; section?: string }>;
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
	const [
		submissions,
		tasks,
		deliverables,
		actionTasks,
		portalResources,
		profileEvents,
	] = await Promise.all([
		listSubmissionsForPerson(db, session.personId),
		listTasksForPerson(db, session.personId),
		listDeliverableBundles(db, { personId: session.personId }),
		listSpeakerActionAssignments(db, { personId: session.personId }),
		listPublishedPortalResourcesForSpeaker(db, session.personId),
		db
			.prepare(
				"SELECT event_id FROM event_speaker_profiles WHERE person_id = ?",
			)
			.bind(session.personId)
			.all<{ event_id: string }>(),
	]);

	const eventRows = await listEventsByIds(db, [
		...submissions.map((submission) => submission.event_id),
		...profileEvents.results.map((row) => row.event_id),
	]);
	const events = new Map(eventRows.map((event) => [event.id, event]));
	const [speakersBySubmission, profileRows, slotRows, handoffs, ackStates] = await Promise.all([
		listSpeakersForSubmissions(
			db,
			submissions.map((submission) => submission.id),
		),
		listSpeakerProfilesForPerson(
			db,
			session.personId,
			eventRows.map((event) => event.id),
		),
		listAgendaSlotsBySubmissionIds(
			db,
			submissions.map((submission) => submission.id),
		),
		listHandoffsForSubmissions(
			db,
			submissions.map((submission) => submission.id),
		),
		Promise.all(
			submissions.map((row) =>
				slotAckStateForActor(db, { submissionId: row.id, actorPersonId: session.personId }),
			),
		),
	]);
	const profilesByEvent = new Map(
		profileRows.map((profile) => [profile.event_id, profile]),
	);
	const slotsBySubmission = new Map(
		slotRows.map((slot) => [slot.submission_id, slot]),
	);

	function toTaskView(task: (typeof tasks)[number]): TaskView {
		const meta = isSpeakerTaskKey(task.template_key)
			? SPEAKER_TASK_TYPE_REGISTRY[task.template_key]
			: null;
		return {
			id: task.id,
			key: task.template_key,
			label: task.template_label || meta?.label || task.template_key,
			kind: task.form_schema_json
				? "form"
				: (task.template_task_kind ?? meta?.kind ?? "file"),
			formFields: parseSavedTaskFormFields(task.form_schema_json),
			status: task.status === "completed" ? "completed" : "pending",
			accept: meta?.accept ?? [],
			textValue: task.text_value,
			assetId: task.asset_id,
			required: task.template_required !== 0,
			instructions: task.instructions ?? null,
			dueAt: task.due_at ?? null,
			versions: (deliverables.get(task.id)?.versions ?? []).map((version) => ({
				id: version.id,
				versionNumber: version.version_number,
				filename: version.filename,
				sizeBytes: version.size_bytes,
				createdAt: version.created_at,
			})),
			comments: (deliverables.get(task.id)?.comments ?? []).map((comment) => ({
				id: comment.id,
				authorName: comment.author_name,
				authorKind: comment.author_kind,
				body: comment.body,
				createdAt: comment.created_at,
			})),
		};
	}

	const applications: PortalApplication[] = submissions.map((row, index) => {
		const answers = parseAnswers(row.answers_json);
		const event = events.get(row.event_id);
		const slot = slotsBySubmission.get(row.id);
		const submissionTasks = tasks
			.filter((task) => task.submission_id === row.id)
			.map(toTaskView);
		const allSpeakers = speakersBySubmission.get(row.id) ?? [];
		const speakers = allSpeakers.filter((speaker) => speaker.position > 0);
		const incoming = handoffs.find(
			(handoff) =>
				handoff.submission_id === row.id &&
				handoff.manager_person_id === session.personId &&
				handoff.status === "accepted",
		);
		const outgoing = handoffs.find(
			(handoff) =>
				handoff.submission_id === row.id &&
				handoff.speaker_person_id === session.personId &&
				(handoff.status === "pending" || handoff.status === "accepted"),
		);
		const isListedSpeaker =
			row.submitter_person_id === session.personId ||
			allSpeakers.some(
				(speaker) =>
					speaker.person_id === session.personId &&
					speaker.status !== "removed" &&
					speaker.status !== "declined",
			);
		const managedSpeaker = incoming
			? allSpeakers.find((speaker) => speaker.person_id === incoming.speaker_person_id)
			: null;
		return {
			id: row.id,
			eventId: row.event_id,
			eventName: event?.name ?? "Event",
			eventMode: event?.mode ?? "live",
			title:
				typeof answers.title === "string" && answers.title.trim()
					? answers.title.trim()
					: "(untitled)",
			status: row.status,
			statusLabel: speakerApplicationStatusLabel(row.status),
			slotLabel:
				slot && event
					? `${slot.room_name} · ${formatEventTime(slot.starts_at, event.timezone)}`
					: null,
			canWithdraw:
				!incoming &&
				isSubmissionStatus(row.status) &&
				canTransitionSubmission(row.status, "withdrawn"),
			removesFromSchedule:
				row.status === "scheduled" || row.status === "published",
			coSpeakers: speakers.map((speaker) => ({
				id: speaker.id,
				name: speaker.name,
				email: speaker.email,
				status: speaker.status,
				invitedAt: speaker.invited_at,
				confirmedAt: speaker.confirmed_at,
				position: speaker.position,
			})),
			profileTasks: submissionTasks.filter((task) =>
				isProfileTaskKey(task.key),
			),
			prepTasks: submissionTasks.filter((task) =>
				isSessionPrepTaskKey(task.key),
			),
			timezone: event?.timezone,
			needsSlotAck: ackStates[index]?.needsAck === true,
			canHandoff: isListedSpeaker && !incoming && outgoing?.status !== "accepted",
			handoffLabel:
				outgoing?.status === "accepted"
					? `Managed by ${outgoing.manager_email}`
					: outgoing?.status === "pending"
						? `Handoff sent to ${outgoing.manager_email}`
						: null,
			actingAsManagerFor: incoming
				? managedSpeaker?.name || managedSpeaker?.email || "speaker"
				: null,
		};
	});

	const eventIdsForProfiles = [
		...new Set([
			...applications.map((app) => app.eventId),
			...profileEvents.results.map((row) => row.event_id),
		]),
	];

	const profiles: PortalEventProfile[] = eventIdsForProfiles.flatMap(
		(eventId) => {
			const event = events.get(eventId);
			if (!event) return [];
			const profile = profilesByEvent.get(eventId);
			const profileTasks = applications
				.filter((app) => app.eventId === eventId)
				.flatMap((app) => app.profileTasks);
			// Dedupe bio/headshot tasks by key (one checklist per event).
			const seen = new Set<string>();
			const deduped = profileTasks.filter((task) => {
				if (seen.has(task.key)) return false;
				seen.add(task.key);
				return true;
			});
			return [
				{
					eventId,
					eventName: event.name,
					eventMode: event.mode ?? "live",
					displayName: profile?.display_name ?? session.email,
					bio: profile?.bio ?? "",
					jobTitle: profile?.job_title ?? "",
					company: profile?.company ?? "",
					salutation: profile?.salutation ?? "",
					pronouns: profile?.pronouns ?? "",
					honorific: profile?.honorific ?? "",
					social: parseSpeakerSocial(profile?.social_json),
					hasHeadshot: Boolean(profile?.headshot_asset_id),
					profileTasks: deduped,
					timezone: event.timezone,
				},
			];
		},
	);

	const resourceGroups: PortalResourceGroup[] = eventRows
		.map((event) => ({
			eventId: event.id,
			eventName: event.name,
			resources: portalResources.filter(
				(resource) => resource.event_id === event.id,
			),
		}))
		.filter((group) => group.resources.length > 0);

	const prepOpen =
		applications.reduce(
			(sum, app) =>
				sum +
				app.prepTasks.filter(
					(task) => task.required && task.status !== "completed",
				).length,
			0,
		) + actionTasks.filter((task) => task.status !== "completed").length;
	const profileOpen = profiles.reduce(
		(sum, profile) =>
			sum +
			profile.profileTasks.filter(
				(task) => task.required && task.status !== "completed",
			).length,
		0,
	);

	const description =
		applications.length === 0
			? "Every proposal tied to this email shows up here — status, profile, and prep when you’re accepted."
			: prepOpen + profileOpen > 0
				? `${applications.length} application${applications.length === 1 ? "" : "s"} · ${profileOpen + prepOpen} item${profileOpen + prepOpen === 1 ? "" : "s"} need you.`
				: `${applications.length} application${applications.length === 1 ? "" : "s"} · you’re caught up on open to-dos.`;

	return (
		<main className="mx-auto max-w-6xl px-4 py-10">
			<PageHeader
				eyebrow="Speaker portal"
				title={session.email}
				description={description}
			/>
			<Suspense
				fallback={
					<p className="mt-8 text-sm text-neutral-500">Loading portal…</p>
				}
			>
				<PortalConsole
					email={session.email}
					applications={applications}
					profiles={profiles}
					actionTasks={actionTasks}
					resourceGroups={resourceGroups}
					demoEventIds={eventRows
						.filter((event) => event.mode === "demo")
						.map((event) => event.id)}
				/>
			</Suspense>
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
