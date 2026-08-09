import Link from "next/link";
import { notFound } from "next/navigation";
import { PublicSpeakerAvatar } from "@/components/public-speaker-avatar";
import { getDb } from "@/lib/db/cloudflare";
import { getEventBySlug, listPublicSpeakersForEvent } from "@/lib/db/queries";

type PageProps = { params: Promise<{ eventSlug: string }> };

export default async function PublicSpeakersPage({ params }: PageProps) {
	const { eventSlug } = await params;
	const db = await getDb();
	const event = await getEventBySlug(db, eventSlug);
	if (!event) notFound();

	const speakers = await listPublicSpeakersForEvent(db, event.id);
	if (speakers.length === 0) notFound();

	return (
		<main className="mx-auto max-w-3xl px-4 py-10 text-neutral-200">
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
			<ul className="mt-8 divide-y divide-neutral-800">
				{speakers.map((speaker) => (
					<li key={speaker.person_id} className="py-4">
						<PublicSpeakerAvatar
							eventSlug={event.slug}
							personId={speaker.person_id}
							name={speaker.display_name}
							hasHeadshot={speaker.has_headshot === 1}
							profileHref={`/e/${event.slug}/speakers/${speaker.person_id}`}
						/>
						{speaker.bio ? (
							<p className="mt-2 max-w-2xl whitespace-pre-wrap text-sm leading-6 text-neutral-400">
								{speaker.bio}
							</p>
						) : null}
					</li>
				))}
			</ul>
		</main>
	);
}
