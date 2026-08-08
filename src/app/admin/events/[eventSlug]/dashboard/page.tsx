import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { isAdminBypass } from "@/lib/auth/admin";
import { getDb } from "@/lib/db/cloudflare";
import { getEventBySlug } from "@/lib/db/queries";
import { loadOutstandingTasksSnapshot } from "@/lib/tasks/outstanding";
import { OutstandingDashboard } from "./outstanding-dashboard";

type Props = {
	params: Promise<{ eventSlug: string }>;
};

export default async function AdminDashboardPage({ params }: Props) {
	const { eventSlug } = await params;

	if (!(await isAdminBypass())) {
		redirect(`/admin/bypass?next=/admin/events/${eventSlug}/dashboard`);
	}

	const db = await getDb();
	const event = await getEventBySlug(db, eventSlug);
	if (!event) notFound();

	const snapshot = await loadOutstandingTasksSnapshot(db, event);

	return (
		<main className="mx-auto min-h-screen max-w-4xl px-4 py-10 text-neutral-900">
			<header className="mb-8 space-y-2 border-b border-neutral-200 pb-4">
				<p className="text-xs uppercase tracking-wide text-neutral-500">
					Organizer · outstanding tasks
				</p>
				<h1 className="text-3xl font-semibold tracking-tight">{event.name}</h1>
				<p className="text-sm text-neutral-600">
					Live incomplete speaker tasks. Prefers EventRoom WebSocket; falls back to 2s
					poll under local `next dev`.{" "}
					<Link
						className="underline"
						href={`/admin/events/${event.slug}/submissions`}
					>
						Submissions
					</Link>
					{" · "}
					<Link className="underline" href={`/admin/events/${event.slug}/schedule`}>
						Schedule
					</Link>
					{" · "}
					<Link className="underline" href={`/admin/events/${event.slug}/tasks`}>
						Static tasks
					</Link>
				</p>
			</header>

			<OutstandingDashboard eventSlug={event.slug} initialSnapshot={snapshot} />
		</main>
	);
}
