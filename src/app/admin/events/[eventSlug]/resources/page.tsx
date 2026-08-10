import { Suspense } from "react";
import { AdminEventNav } from "@/components/admin-event-nav";
import { PageHeader } from "@/components/page-header";
import { assertCanManageEvent } from "@/lib/auth/admin";
import { getDb } from "@/lib/db/cloudflare";
import { listOrganizerPortalResources } from "@/lib/resources/resources";
import { ResourceManager } from "./resource-manager";

export default async function ResourcesPage({ params }: { params: Promise<{ eventSlug: string }> }) {
	const { eventSlug } = await params;
	const db = await getDb();
	const { event } = await assertCanManageEvent(db, eventSlug);
	const resources = await listOrganizerPortalResources(db, event.id);
	return (
		<div className="min-h-dvh bg-neutral-950 text-neutral-200">
			<AdminEventNav eventSlug={event.slug} />
			<main className="mx-auto max-w-6xl px-4 py-10">
				<PageHeader
					eyebrow="Organizer · Portal wiki"
					title={event.name}
					description="Publish speaker guides and constrained external embeds. Draft resources stay organizer-only until you publish them."
				/>
				<Suspense
					fallback={<p className="mt-8 text-sm text-neutral-500">Loading resources…</p>}
				>
					<ResourceManager
						eventSlug={event.slug}
						initialResources={resources}
						readOnly={event.mode === "demo"}
					/>
				</Suspense>
			</main>
		</div>
	);
}
