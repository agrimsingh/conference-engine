import { AdminEventNav } from "@/components/admin-event-nav";
import { PageHeader } from "@/components/page-header";
import { assertCanManageEvent } from "@/lib/auth/admin";
import { getDb } from "@/lib/db/cloudflare";
import { listEventDeliveryHistory, listReminderRecipients } from "@/lib/email/communications";
import { listEventMessageTemplates } from "@/lib/email/templates";
import { CommunicationsConsole } from "./communications-console";

type Props = { params: Promise<{ eventSlug: string }> };

export default async function CommunicationsPage({ params }: Props) {
	const { eventSlug } = await params;
	const db = await getDb();
	const { event } = await assertCanManageEvent(db, eventSlug);
	const [templates, deliveries, reminders] = await Promise.all([
		listEventMessageTemplates(db, event.id),
		listEventDeliveryHistory(db, event.id),
		listReminderRecipients(db, event.id),
	]);
	return <div className="min-h-dvh bg-neutral-950 text-neutral-200"><AdminEventNav eventSlug={event.slug} /><main className="mx-auto max-w-4xl px-4 py-10"><PageHeader eyebrow="Organizer · Communications" title={event.name} description="Edit email templates, send speaker reminders, and see what was delivered." /><CommunicationsConsole eventSlug={event.slug} templates={templates} deliveries={deliveries} reminders={reminders} /></main></div>;
}
