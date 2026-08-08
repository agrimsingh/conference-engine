import Link from "next/link";
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
			<main className="mx-auto min-h-screen max-w-lg px-4 py-10 text-neutral-900">
				<header className="mb-8 space-y-2 border-b border-neutral-200 pb-4">
					<p className="text-xs uppercase tracking-wide text-neutral-500">
						Speaker portal
					</p>
					<h1 className="text-3xl font-semibold tracking-tight">Sign in</h1>
					<p className="text-sm text-neutral-600">
						Enter the email from your accepted talk. We&apos;ll email you a
						sign-in link — check your inbox.
					</p>
				</header>
				<PortalLoginForm initialEmail={params.email ?? ""} />
				<p className="mt-6 text-sm text-neutral-500">
					<Link className="underline" href="/">
						Home
					</Link>
				</p>
			</main>
		);
	}

	const session = await readPortalSession(token);
	if (!session) {
		return (
			<main className="mx-auto min-h-screen max-w-lg px-4 py-10 text-neutral-900">
				<p className="text-sm text-red-700">Invalid or expired portal token.</p>
				<p className="mt-4 text-sm">
					<Link className="underline" href="/portal">
						Request a new token
					</Link>
				</p>
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

	return (
		<main className="mx-auto min-h-screen max-w-2xl px-4 py-10 text-neutral-900">
			<header className="mb-8 space-y-2 border-b border-neutral-200 pb-4">
				<p className="text-xs uppercase tracking-wide text-neutral-500">
					Speaker portal
				</p>
				<h1 className="text-3xl font-semibold tracking-tight">{session.email}</h1>
				<p className="text-sm text-neutral-600">
					Accepted talks and onboarding checklist. Token is in the query string for
					Sat/Sun speed.
				</p>
			</header>

			<section className="mb-10 space-y-3">
				<h2 className="text-lg font-medium">Submissions</h2>
				{submissions.length === 0 ? (
					<p className="text-sm text-neutral-600">No accepted submissions yet.</p>
				) : (
					<ul className="divide-y divide-neutral-200 rounded border border-neutral-200 bg-white">
						{submissions.map((row) => {
							const answers = parseAnswers(row.answers_json);
							return (
								<li key={row.id} className="px-4 py-3 text-sm">
									<p className="font-medium">
										{typeof answers.title === "string" ? answers.title : "(untitled)"}
									</p>
									<p className="text-neutral-600">
										{events.get(row.event_id) ?? row.event_id} · {row.status}
									</p>
									<p className="font-mono text-xs text-neutral-500">{row.id}</p>
								</li>
							);
						})}
					</ul>
				)}
			</section>

			<section className="space-y-3">
				<h2 className="text-lg font-medium">Tasks</h2>
				{tasks.length === 0 ? (
					<p className="text-sm text-neutral-600">No tasks yet.</p>
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
