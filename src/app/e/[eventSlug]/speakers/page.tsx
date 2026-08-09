import Link from "next/link";
import { notFound } from "next/navigation";
import { PublicSpeakersDirectory } from "@/components/public-speakers-directory";
import { getDb } from "@/lib/db/cloudflare";
import { getEventBySlug, listPublicSpeakersForEvent } from "@/lib/db/queries";
import { sortSpeakersBySurname } from "@/lib/speakers/public-directory";

type PageProps = {
	params: Promise<{ eventSlug: string }>;
	searchParams: Promise<{ view?: string }>;
};

function parseView(value: string | undefined): "list" | "gallery" {
	return value === "gallery" ? "gallery" : "list";
}

export default async function PublicSpeakersPage({ params, searchParams }: PageProps) {
	const { eventSlug } = await params;
	const { view: viewParam } = await searchParams;
	const db = await getDb();
	const event = await getEventBySlug(db, eventSlug);
	if (!event) notFound();

	const speakers = await listPublicSpeakersForEvent(db, event.id);
	if (speakers.length === 0) notFound();

	const directory = sortSpeakersBySurname(
		speakers.map((speaker) => ({
			personId: speaker.person_id,
			displayName: speaker.display_name,
			bio: speaker.bio,
			hasHeadshot: speaker.has_headshot === 1,
			jobTitle: speaker.job_title,
			company: speaker.company,
		})),
	);

	return (
		<main className="mx-auto max-w-5xl px-4 py-10 text-neutral-200">
			<Link
				href={`/e/${event.slug}/schedule`}
				className="text-sm text-neutral-400 underline underline-offset-2 hover:text-neutral-100"
			>
				Back to schedule
			</Link>
			<header className="mt-6 border-b border-neutral-800 pb-6">
				<p className="text-xs font-medium uppercase tracking-wide text-neutral-500">Speakers</p>
				<h1 className="mt-2 text-balance text-3xl font-semibold tracking-tight text-neutral-100">
					{event.name}
				</h1>
			</header>
			<div className="mt-8">
				<PublicSpeakersDirectory
					eventSlug={event.slug}
					speakers={directory}
					initialView={parseView(viewParam)}
				/>
			</div>
		</main>
	);
}
