import { notFound, redirect } from "next/navigation";
import { AdminEventNav } from "@/components/admin-event-nav";
import { PageHeader } from "@/components/page-header";
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
		<div className="min-h-dvh bg-neutral-950 text-neutral-200">
			<AdminEventNav eventSlug={event.slug} />
			<main className="mx-auto max-w-4xl px-4 py-10">
				<PageHeader
					eyebrow="Organizer · Dashboard"
					title={event.name}
					description="Live view of incomplete speaker tasks — bio, headshot, slides, and docs still outstanding."
				/>

				<OutstandingDashboard eventSlug={event.slug} initialSnapshot={snapshot} />
			</main>
		</div>
	);
}
