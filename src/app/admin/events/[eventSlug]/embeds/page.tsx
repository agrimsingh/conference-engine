import { headers } from "next/headers";
import { AdminEventNav } from "@/components/admin-event-nav";
import { PageHeader } from "@/components/page-header";
import { assertCanManageEvent } from "@/lib/auth/admin";
import { getDb } from "@/lib/db/cloudflare";
import { listAgendaTracks } from "@/lib/db/queries";
import { buildEmbedUrls, listEmbeds } from "@/lib/embeds/embed";
import { EmbedBuilder } from "./embed-builder";

type Props = { params: Promise<{ eventSlug: string }> };
export default async function EmbedsPage({ params }: Props) {
	const { eventSlug } = await params; const db = await getDb(); const { event } = await assertCanManageEvent(db, eventSlug); const headerList = await headers(); const host = headerList.get("host") ?? "localhost:3000"; const origin = `${headerList.get("x-forwarded-proto") ?? "http"}://${host}`;
	const [embedRows, tracks] = await Promise.all([
		listEmbeds(db, event.id),
		listAgendaTracks(db, event.id),
	]);
	const embeds = embedRows.map((embed) => ({
		...embed,
		urls: buildEmbedUrls(origin, event.slug, embed.slug),
	}));
	return (
		<div className="min-h-dvh bg-neutral-950 text-neutral-200">
			<AdminEventNav eventSlug={event.slug} />
			<main className="mx-auto max-w-5xl px-4 py-10">
				<PageHeader eyebrow="Public widgets" title="Embeds" description="Build event-scoped widgets that always read the approved public program." />
				<EmbedBuilder
					eventSlug={event.slug}
					initialEmbeds={embeds}
					trackOptions={tracks.map((track) => ({ id: track.id, name: track.name }))}
				/>
			</main>
		</div>
	);
}
