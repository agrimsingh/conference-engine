import Link from "next/link";
import { notFound } from "next/navigation";
import { PublicSpeakerAvatar } from "@/components/public-speaker-avatar";
import { getDb } from "@/lib/db/cloudflare";
import {
	getEventBySlug,
	getPublicSpeakerDirectoryEntry,
	listPublishedSessionsForPublicSpeaker,
} from "@/lib/db/queries";
import { titleFromAnswers } from "@/lib/domain";
import { formatClock } from "@/lib/schedule/time";

type PageProps = { params: Promise<{ eventSlug: string; personId: string }> };

function answersFromJson(raw: string): Record<string, unknown> {
	try {
		const parsed: unknown = JSON.parse(raw);
		return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
			? (parsed as Record<string, unknown>)
			: {};
	} catch {
		return {};
	}
}

export default async function PublicSpeakerProfilePage({ params }: PageProps) {
	const { eventSlug, personId } = await params;
	const db = await getDb();
	const event = await getEventBySlug(db, eventSlug);
	if (!event) notFound();

	const speaker = await getPublicSpeakerDirectoryEntry(db, event.id, personId);
	if (!speaker) notFound();

	const sessions = await listPublishedSessionsForPublicSpeaker(db, event.id, personId);

	return (
		<main className="mx-auto max-w-3xl px-4 py-10 text-neutral-200">
			<Link
				href={`/e/${event.slug}/speakers`}
				className="text-sm text-neutral-400 underline underline-offset-2 hover:text-neutral-100"
			>
				All speakers
			</Link>
			<header className="mt-6 border-b border-neutral-800 pb-6">
				<PublicSpeakerAvatar
					eventSlug={event.slug}
					personId={speaker.person_id}
					name={speaker.display_name}
					hasHeadshot={speaker.has_headshot === 1}
				/>
				<p className="mt-3 text-sm text-neutral-500">{event.name}</p>
			</header>
			{speaker.bio ? (
				<section className="mt-8">
					<h2 className="text-lg font-medium text-neutral-100">About</h2>
					<p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-neutral-300">
						{speaker.bio}
					</p>
				</section>
			) : null}
			<section className="mt-8">
				<h2 className="text-lg font-medium text-neutral-100">Sessions</h2>
				{sessions.length === 0 ? (
					<p className="mt-2 text-sm text-neutral-500">No published sessions.</p>
				) : (
					<ul className="mt-3 space-y-3">
						{sessions.map((session) => {
							const title = titleFromAnswers(answersFromJson(session.title_json));
							return (
								<li key={session.submission_id}>
									<p className="font-mono text-xs tabular-nums text-neutral-500">
										{formatClock(session.starts_at, event.timezone)}–
										{formatClock(session.ends_at, event.timezone)} · {session.room_name}
									</p>
									<Link
										href={`/e/${event.slug}/sessions/${session.submission_id}`}
										className="mt-0.5 block font-medium text-neutral-100 hover:underline"
									>
										{title}
									</Link>
								</li>
							);
						})}
					</ul>
				)}
			</section>
		</main>
	);
}
