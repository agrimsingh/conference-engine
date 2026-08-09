import Link from "next/link";
import { AdminEventNav } from "@/components/admin-event-nav";
import { PageHeader } from "@/components/page-header";
import { assertCanManageEvent } from "@/lib/auth/admin";
import { getDb } from "@/lib/db/cloudflare";
import { eventReadiness, loadEventConfiguration } from "@/lib/events/configuration";

type Props = { params: Promise<{ eventSlug: string }> };

export default async function EventSetupPage({ params }: Props) {
	const { eventSlug } = await params;
	const db = await getDb();
	const { event } = await assertCanManageEvent(db, eventSlug);
	const readiness = eventReadiness(await loadEventConfiguration(db, event.id), event.slug);
	const complete = readiness.filter((item) => item.complete).length;
	return <div className="min-h-dvh bg-neutral-950 text-neutral-200"><AdminEventNav eventSlug={event.slug} /><main className="mx-auto max-w-3xl px-4 py-10"><PageHeader eyebrow="Organizer setup" title={event.name} description={`${complete} of ${readiness.length} essentials are ready. Complete the remaining items, then open your CFP.`} /><ul className="mt-8 divide-y divide-neutral-800 overflow-hidden rounded-lg border border-neutral-800 bg-neutral-900">{readiness.map((item) => <li key={item.key}><Link href={item.href} className="flex items-center justify-between gap-4 px-4 py-4 hover:bg-neutral-800/60"><span><span className="block font-medium text-neutral-100">{item.complete ? "Ready" : "Needs attention"} · {item.label}</span><span className="mt-1 block text-sm text-neutral-400">{item.detail}</span></span><span className={item.complete ? "text-sm text-emerald-400" : "text-sm text-amber-300"}>{item.complete ? "Review" : "Set up"} →</span></Link></li>)}</ul><div className="mt-8 flex flex-wrap gap-3 text-sm"><Link href={`/admin/events/${event.slug}/forms`} className="rounded-md border border-neutral-700 px-3 py-2 text-neutral-200 hover:bg-neutral-800">Manage CFP</Link><Link href={`/admin/events/${event.slug}/submissions`} className="rounded-md border border-neutral-700 px-3 py-2 text-neutral-200 hover:bg-neutral-800">Review submissions</Link><Link href={`/admin/events/${event.slug}/schedule`} className="rounded-md border border-neutral-700 px-3 py-2 text-neutral-200 hover:bg-neutral-800">Open schedule</Link></div></main></div>;
}
