import { AdminEventNav } from "@/components/admin-event-nav";
import { PageHeader } from "@/components/page-header";
import { assertCanManageEvent } from "@/lib/auth/admin";
import { getDb } from "@/lib/db/cloudflare";
import { listEventSpeakerRoster } from "@/lib/speakers/roster";
import { listSpeakerCrmOwners } from "@/lib/speakers/crm";
import { SpeakerRoster } from "./speaker-roster";

type Props = {
	params: Promise<{ eventSlug: string }>;
	searchParams: Promise<{ status?: string; q?: string }>;
};

export default async function AdminSpeakersPage({ params, searchParams }: Props) {
	const { eventSlug } = await params;
	const query = await searchParams;
	const db = await getDb();
	const { event } = await assertCanManageEvent(db, eventSlug);
	const [speakers, crmOwners] = await Promise.all([
		listEventSpeakerRoster(db, event.id),
		listSpeakerCrmOwners(db, event.id),
	]);
	const initialStatus =
		query.status === "invited"
		|| query.status === "confirmed"
		|| query.status === "declined"
		|| query.status === "withdrawn"
			? query.status
			: "all";

	return (
		<div className="min-h-dvh bg-neutral-950 text-neutral-200">
			<AdminEventNav eventSlug={event.slug} />
			<main className="mx-auto max-w-6xl px-4 py-10">
				<PageHeader
					eyebrow="Organizer · Speakers"
					title={event.name}
					description="Searchable roster of confirmed speakers and the accepted pipeline. Workflow status, contact fields, and task reminders are event-scoped."
				/>
				<SpeakerRoster
					eventSlug={event.slug}
					initialSpeakers={speakers}
					initialStatus={initialStatus}
					initialQuery={query.q ?? ""}
					eventName={event.name}
					crmOwners={crmOwners}
				/>
			</main>
		</div>
	);
}
