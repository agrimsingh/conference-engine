import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { isAdminBypass } from "@/lib/auth/admin";
import { getDb } from "@/lib/db/cloudflare";
import { getEventBySlug, listSubmissionsForEvent } from "@/lib/db/queries";

type Props = {
	params: Promise<{ eventSlug: string }>;
};

export default async function AdminSubmissionsPage({ params }: Props) {
	const { eventSlug } = await params;

	if (!(await isAdminBypass())) {
		redirect(`/admin/bypass?next=/admin/events/${eventSlug}/submissions`);
	}

	const db = await getDb();
	const event = await getEventBySlug(db, eventSlug);
	if (!event) notFound();

	const submissions = await listSubmissionsForEvent(db, event.id);

	return (
		<main className="mx-auto min-h-screen max-w-4xl px-4 py-10 text-neutral-900">
			<header className="mb-8 space-y-2 border-b border-neutral-200 pb-4">
				<p className="text-xs uppercase tracking-wide text-neutral-500">
					Organizer · local admin bypass cookie
				</p>
				<h1 className="text-3xl font-semibold tracking-tight">{event.name}</h1>
				<p className="text-sm text-neutral-600">
					Submissions ({submissions.length}). Auth is a temporary{" "}
					<code className="text-xs">ce_admin_bypass=1</code> cookie via{" "}
					<Link className="underline" href="/admin/bypass">
						/admin/bypass
					</Link>
					. Magic-link auth comes later.
				</p>
				<p className="text-sm">
					Public CFP:{" "}
					<Link className="underline" href={`/e/${event.slug}/submit/cfp`}>
						/e/{event.slug}/submit/cfp
					</Link>
				</p>
			</header>

			{submissions.length === 0 ? (
				<p className="text-sm text-neutral-600">No submissions yet.</p>
			) : (
				<ul className="divide-y divide-neutral-200 rounded border border-neutral-200 bg-white">
					{submissions.map((row) => {
						const answers = parseAnswers(row.answers_json);
						return (
							<li key={row.id} className="px-4 py-3 text-sm">
								<div className="flex flex-wrap items-baseline justify-between gap-2">
									<p className="font-medium">
										{typeof answers.title === "string" ? answers.title : "(untitled)"}
									</p>
									<span className="rounded bg-neutral-100 px-2 py-0.5 text-xs uppercase tracking-wide">
										{row.status}
									</span>
								</div>
								<p className="mt-1 text-neutral-600">
									{row.submitter_name} · {row.submitter_email}
									{typeof answers.format === "string" ? ` · ${answers.format}` : ""}
								</p>
								<p className="mt-1 font-mono text-xs text-neutral-500">{row.id}</p>
							</li>
						);
					})}
				</ul>
			)}
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
