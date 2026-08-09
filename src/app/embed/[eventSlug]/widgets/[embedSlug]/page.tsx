import { notFound } from "next/navigation";
import type { CSSProperties } from "react";
import { getDb } from "@/lib/db/cloudflare";
import { buildPublicEmbedPayload } from "@/lib/embeds/embed";
import { AgendaWidget, ItineraryWidget, SessionsWidget, SpeakersWidget } from "../embed-widgets";

type Props = { params: Promise<{ eventSlug: string; embedSlug: string }> };
export default async function PublicEmbedPage({ params }: Props) {
	const { eventSlug, embedSlug } = await params;
	const payload = await buildPublicEmbedPayload(await getDb(), eventSlug, embedSlug);
	if (!payload) notFound();
	const style = { "--embed-accent": payload.embed.config.brandColor } as CSSProperties;
	return (
		<main style={style} className="mx-auto min-h-dvh max-w-5xl bg-neutral-950 px-4 py-6 text-neutral-200">
			<header className="border-b border-neutral-800 pb-4">
				<p className="text-xs uppercase tracking-wide text-neutral-500">{payload.embed.name}</p>
				<h1 className="mt-1 text-2xl font-semibold text-neutral-100">{payload.event.name}</h1>
			</header>
			{payload.embed.widgetType === "speakers" ? <SpeakersWidget payload={payload} gallery={false} /> : null}
			{payload.embed.widgetType === "speaker_gallery" ? <SpeakersWidget payload={payload} gallery /> : null}
			{payload.embed.widgetType === "itinerary" ? <ItineraryWidget payload={payload} /> : null}
			{payload.embed.widgetType === "agenda" ? <AgendaWidget payload={payload} /> : null}
			{payload.embed.widgetType === "sessions" ? <SessionsWidget payload={payload} /> : null}
		</main>
	);
}
