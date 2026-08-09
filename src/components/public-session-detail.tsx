import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb } from "@/lib/db/cloudflare";
import { loadPublicSession, safeExternalUrl } from "@/lib/sessions/session";
import { formatClock } from "@/lib/schedule/time";

function answersFromJson(raw: string): Record<string, unknown> {
	try {
		const parsed: unknown = JSON.parse(raw);
		return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
			? parsed as Record<string, unknown>
			: {};
	} catch { return {}; }
}

export async function PublicSessionDetail({ params, basePath }: { params: Promise<{ eventSlug: string; sessionId: string }>; basePath: "/e" | "/embed" }) {
	const { eventSlug, sessionId } = await params;
	const session = await loadPublicSession(await getDb(), eventSlug, sessionId);
	if (!session) notFound();
	const answers = answersFromJson(session.submission.answers_json);
	const title = typeof answers.title === "string" && answers.title.trim() ? answers.title.trim() : "Untitled session";
	const abstract = typeof answers.abstract === "string" ? answers.abstract.trim() : "";
	const links = [
		{ label: "Watch video", href: safeExternalUrl(session.submission.video_url) },
		{ label: "Open Google Doc", href: safeExternalUrl(session.submission.google_doc_url) },
		{ label: "Supporting material", href: safeExternalUrl(session.submission.supporting_url) },
	].filter((link): link is { label: string; href: string } => Boolean(link.href));
	return (
		<main className="mx-auto max-w-3xl px-4 py-10 text-neutral-200">
			<Link href={`${basePath}/${session.event.slug}/schedule`} className="text-sm text-neutral-400 underline underline-offset-2 hover:text-neutral-100">Back to schedule</Link>
			<header className="mt-6 border-b border-neutral-800 pb-6">
				<p className="font-mono text-xs tabular-nums text-neutral-500">{formatClock(session.slot.startsAt, session.event.timezone)}–{formatClock(session.slot.endsAt, session.event.timezone)} · {session.slot.roomName}</p>
				<h1 className="mt-2 text-balance text-3xl font-semibold tracking-tight text-neutral-100">{title}</h1>
				{session.speakers.length > 0 ? <p className="mt-3 text-sm text-neutral-400">{session.speakers.map((speaker) => speaker.name || speaker.email).join(", ")}</p> : null}
			</header>
			{abstract ? <section className="mt-8"><h2 className="text-lg font-medium text-neutral-100">About this session</h2><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-neutral-300">{abstract}</p></section> : null}
			{session.speakers.some((speaker) => speaker.bio) ? <section className="mt-8"><h2 className="text-lg font-medium text-neutral-100">Speakers</h2><ul className="mt-3 space-y-3">{session.speakers.map((speaker) => <li key={speaker.id}><p className="font-medium text-neutral-100">{speaker.name || speaker.email}</p>{speaker.bio ? <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-neutral-400">{speaker.bio}</p> : null}</li>)}</ul></section> : null}
			{links.length > 0 ? <section className="mt-8"><h2 className="text-lg font-medium text-neutral-100">Session resources</h2><ul className="mt-3 flex flex-wrap gap-2">{links.map((link) => <li key={link.href}><a className="rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-200 hover:border-neutral-500" href={link.href} target="_blank" rel="noreferrer">{link.label}</a></li>)}</ul></section> : null}
		</main>
	);
}
