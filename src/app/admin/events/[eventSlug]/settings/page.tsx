import { Suspense } from "react";
import { AdminEventNav } from "@/components/admin-event-nav";
import { PageHeader } from "@/components/page-header";
import { assertCanManageEvent } from "@/lib/auth/admin";
import { getDb } from "@/lib/db/cloudflare";
import { loadEventConfiguration } from "@/lib/events/configuration";
import { SettingsEditor } from "./settings-editor";

type Props = { params: Promise<{ eventSlug: string }> };

export default async function EventSettingsPage({ params }: Props) {
	const { eventSlug } = await params;
	const db = await getDb();
	const { event } = await assertCanManageEvent(db, eventSlug);
	const configuration = await loadEventConfiguration(db, event.id);

	return (
		<div className="min-h-dvh bg-neutral-950 text-neutral-200">
			<AdminEventNav eventSlug={event.slug} />
			<main className="mx-auto max-w-6xl px-4 py-10">
				<PageHeader
					eyebrow="Organizer settings"
					title={event.name}
					description="Set the event defaults used by the schedule, then keep rooms, tracks, and speaker tasks current."
				/>
				<Suspense
					fallback={
						<p className="mt-8 text-sm text-neutral-500">Loading settings…</p>
					}
				>
					<SettingsEditor eventSlug={event.slug} configuration={configuration} />
				</Suspense>
			</main>
		</div>
	);
}
