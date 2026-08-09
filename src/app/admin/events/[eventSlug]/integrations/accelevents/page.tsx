import { AdminEventNav } from "@/components/admin-event-nav";
import { PageHeader } from "@/components/page-header";
import { assertCanManageEvent } from "@/lib/auth/admin";
import { getDb } from "@/lib/db/cloudflare";
import { getAcceleventsIntegrationStatus } from "@/lib/integrations/accelevents/repository";
import { AcceleventsIntegrationPanel } from "./accelevents-integration-panel";

type Props = { params: Promise<{ eventSlug: string }> };

export default async function AcceleventsIntegrationPage({ params }: Props) {
	const { eventSlug } = await params;
	const db = await getDb();
	const { event } = await assertCanManageEvent(db, eventSlug);
	const integration = await getAcceleventsIntegrationStatus(db, event.id);
	return (
		<div className="min-h-dvh bg-neutral-950 text-neutral-200">
			<AdminEventNav eventSlug={event.slug} />
			<main className="mx-auto max-w-4xl px-4 py-10">
				<PageHeader eyebrow="Organizer integration" title="Accelevents sync" description="Project the speaker and session records you already control in D1 to one Accelevents event." />
				<AcceleventsIntegrationPanel eventSlug={event.slug} initialIntegration={integration} />
			</main>
		</div>
	);
}
