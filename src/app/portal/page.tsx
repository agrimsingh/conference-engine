import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/ui";
import { getDb } from "@/lib/db/cloudflare";
import {
	listEventsByIds,
	listSubmissionsForPerson,
	listTasksForPerson,
} from "@/lib/db/queries";
import { SPEAKER_TASK_TYPE_REGISTRY, isSpeakerTaskKey } from "@/lib/domain";
import { readPortalSession } from "@/lib/speakers/portal-session";
import { PortalLoginForm } from "./portal-login-form";
import { TaskChecklist } from "./task-checklist";

type Props = {
	searchParams: Promise<{ token?: string; email?: string }>;
};

export default async function PortalPage({ searchParams }: Props) {
	const params = await searchParams;
	const token = typeof params.token === "string" ? params.token : "";

	if (!token) {
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

	const session = await readPortalSession(token);
	if (!session) {
		return (
			<main className="mx-auto max-w-lg px-4 py-10">
				<div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-6">
					<p className="text-sm font-medium text-red-300">
						This sign-in link is invalid or expired
					</p>
					<p className="mt-1 text-sm text-red-400">
						Request a fresh link — they expire for security.
					</p>
					<p className="mt-4">
						<Link
							className="text-sm font-medium text-red-300 underline underline-offset-2"
							href="/portal"
						>
							Request a new link
						</Link>
					</p>
				</div>
			</main>
		);
	}

	const db = await getDb();
	const submissions = await listSubmissionsForPerson(db, session.personId);
	const tasks = await listTasksForPerson(db, session.personId);

	const eventRows = await listEventsByIds(db, submissions.map((submission) => submission.event_id));
	const events = new Map(eventRows.map((event) => [event.id, event.name]));

	const completedCount = tasks.filter((t) => t.status === "completed").length;
	const portalDescription = submissions.length === 0
		? "Every proposal tied to this email will show here, and accepted talks include their onboarding work."
		: tasks.length > 0
			? `${completedCount}/${tasks.length} onboarding tasks complete.`
			: `${submissions.length} proposal${submissions.length === 1 ? "" : "s"} on file. We’ll show speaker materials here when they’re ready.`;

	return (
		<main className="mx-auto max-w-2xl px-4 py-10">
			<PageHeader
				eyebrow="Speaker portal"
				title={session.email}
				description={portalDescription}
			/>

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
								const completed = submissionTasks.filter((task) => task.status === "completed").length;
								return (
									<li key={row.id} className="rounded-lg border border-neutral-800 bg-neutral-900 px-4 py-4 text-sm">
										<p className="font-medium text-neutral-100">
										{typeof answers.title === "string" ? answers.title : "(untitled)"}
									</p>
										<p className="mt-1 text-neutral-400">
										{events.get(row.event_id) ?? "Event"} ·{" "}
										{row.status.replaceAll("_", " ")}
										</p>
										{row.status === "accepted" || row.status === "scheduled" || row.status === "published" ? (
											<div className="mt-4 border-t border-neutral-800 pt-3">
												<div className="mb-3 flex items-baseline justify-between gap-3">
													<p className="font-medium text-neutral-200">Speaker materials</p>
													<span className="text-xs text-neutral-500">{completed}/{submissionTasks.length} complete</span>
												</div>
												{submissionTasks.length === 0 ? (
													<p className="text-neutral-500">Materials are being prepared by the organizers.</p>
												) : (
													<TaskChecklist token={token} compact tasks={submissionTasks.map((task) => {
														const meta = isSpeakerTaskKey(task.template_key) ? SPEAKER_TASK_TYPE_REGISTRY[task.template_key] : null;
														return { id: task.id, key: task.template_key, label: meta?.label ?? task.template_key, kind: meta?.kind ?? "file", status: task.status, accept: meta?.accept ?? [], textValue: task.text_value, assetId: task.asset_id };
														})} />
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
