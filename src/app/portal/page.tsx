import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { getDb } from "@/lib/db/cloudflare";
import {
	getEventById,
	listAcceptedSubmissionsForPerson,
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
			<main className="mx-auto min-h-dvh max-w-lg px-4 py-10 text-neutral-900">
				<PageHeader
					eyebrow="Speaker portal"
					title="Sign in"
					description="Enter the email on your accepted talk. We'll email a one-time sign-in link — check your inbox (and spam) for conference-engine."
				/>
				<PortalLoginForm initialEmail={params.email ?? ""} />
				<p className="mt-8 text-sm text-neutral-500">
					<Link
						className="underline underline-offset-2"
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
			<main className="mx-auto min-h-dvh max-w-lg px-4 py-10 text-neutral-900">
				<div className="rounded-lg border border-red-200 bg-red-50 px-4 py-6">
					<p className="text-sm font-medium text-red-900">
						This sign-in link is invalid or expired
					</p>
					<p className="mt-1 text-sm text-red-800">
						Request a fresh link — they expire for security.
					</p>
					<p className="mt-4">
						<Link
							className="text-sm font-medium text-red-900 underline underline-offset-2"
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
	const submissions = await listAcceptedSubmissionsForPerson(db, session.personId);
	const tasks = await listTasksForPerson(db, session.personId);

	const eventIds = [...new Set(submissions.map((s) => s.event_id))];
	const events = new Map<string, string>();
	for (const eventId of eventIds) {
		const event = await getEventById(db, eventId);
		if (event) events.set(event.id, event.name);
	}

	const completedCount = tasks.filter((t) => t.status === "completed").length;

	return (
		<main className="mx-auto min-h-dvh max-w-2xl px-4 py-10 text-neutral-900">
			<PageHeader
				eyebrow="Speaker portal"
				title={session.email}
				description={
					tasks.length === 0
						? "Your accepted talks and onboarding checklist will show up here."
						: `${completedCount}/${tasks.length} onboarding tasks complete.`
				}
			/>

			<section className="mb-10 space-y-3">
				<h2 className="text-sm font-medium uppercase tracking-wide text-neutral-500">
					Your talks
				</h2>
				{submissions.length === 0 ? (
					<div className="rounded-lg border border-dashed border-neutral-300 bg-neutral-50 px-4 py-8 text-center">
						<p className="text-sm font-medium text-neutral-900">
							No accepted talks yet
						</p>
						<p className="mt-1 text-sm text-neutral-600">
							Once organizers accept your proposal, it appears here with tasks.
						</p>
					</div>
				) : (
					<ul className="divide-y divide-neutral-200 rounded-lg border border-neutral-200 bg-white">
						{submissions.map((row) => {
							const answers = parseAnswers(row.answers_json);
							return (
								<li key={row.id} className="px-4 py-3 text-sm">
									<p className="font-medium">
										{typeof answers.title === "string" ? answers.title : "(untitled)"}
									</p>
									<p className="mt-1 text-neutral-600">
										{events.get(row.event_id) ?? "Event"} ·{" "}
										{row.status.replaceAll("_", " ")}
									</p>
								</li>
							);
						})}
					</ul>
				)}
			</section>

			<section className="space-y-3">
				<h2 className="text-sm font-medium uppercase tracking-wide text-neutral-500">
					Onboarding checklist
				</h2>
				{tasks.length === 0 ? (
					<div className="rounded-lg border border-dashed border-neutral-300 bg-neutral-50 px-4 py-8 text-center">
						<p className="text-sm font-medium text-neutral-900">
							No tasks yet
						</p>
						<p className="mt-1 text-sm text-neutral-600">
							Bio, headshot, slides, and docs will show up after acceptance.
						</p>
					</div>
				) : (
					<TaskChecklist
						token={token}
						tasks={tasks.map((task) => {
							const meta = isSpeakerTaskKey(task.template_key)
								? SPEAKER_TASK_TYPE_REGISTRY[task.template_key]
								: null;
							return {
								id: task.id,
								key: task.template_key,
								label: meta?.label ?? task.template_key,
								kind: meta?.kind ?? "file",
								status: task.status,
								accept: meta?.accept ?? [],
								textValue: task.text_value,
								assetId: task.asset_id,
							};
						})}
					/>
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
