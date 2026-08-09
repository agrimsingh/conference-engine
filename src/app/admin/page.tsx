import Link from "next/link";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { buttonClasses } from "@/components/ui";
import {
	hasAdminAccess,
	isAdminBypass,
	listAccessibleEvents,
} from "@/lib/auth/admin";
import { getDb } from "@/lib/db/cloudflare";
import { listOrphanEvents } from "@/lib/db/queries";
import { ClaimOrphanButton } from "./claim-orphan-button";
import { CreateEventForm } from "./create-event-form";

type Props = {
	searchParams: Promise<{ next?: string }>;
};

export default async function AdminHomePage({ searchParams }: Props) {
	const params = await searchParams;
	const db = await getDb();
	const allowed = await hasAdminAccess(db);

	if (!allowed) {
		const next = params.next?.startsWith("/") ? params.next : "/admin";
		redirect(`/login?next=${encodeURIComponent(next)}`);
	}

	const { events, bypass, account } = await listAccessibleEvents(db);
	const bypassActive = await isAdminBypass();
	const orphans =
		account && !bypassActive ? await listOrphanEvents(db) : [];

	return (
		<main className="mx-auto max-w-3xl px-4 py-10">
			<PageHeader
				eyebrow="Organizer"
				title="Your events"
				description={
					bypass
						? "Demo bypass active — all events visible. Sign in to attach memberships on create."
						: account
							? `Signed in as ${account.email}`
							: "Pick an event to manage."
				}
			/>

			{bypassActive && !account ? (
				<p className="mb-6 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
					Bypass cookie set.{" "}
					<Link href="/login?next=/admin" className="underline underline-offset-2">
						Sign in
					</Link>{" "}
					to create events with owner membership, or use bypass-only create below.
				</p>
			) : null}

			{account ? (
				<form action="/api/auth/logout?next=/login" method="post" className="mb-6">
					<button type="submit" className={buttonClasses("secondary")}>
						Sign out
					</button>
				</form>
			) : null}

			<section className="mb-10 space-y-3">
				<h2 className="text-sm font-medium uppercase tracking-wide text-neutral-500">
					Events
				</h2>
				{events.length === 0 ? (
					<p className="rounded-lg border border-neutral-800 bg-neutral-900 px-4 py-5 text-sm text-neutral-400">
						No events yet. Create one below
						{orphans.length > 0 ? ", or claim an unowned event" : ""}.
					</p>
				) : (
					<ul className="divide-y divide-neutral-800 rounded-lg border border-neutral-800 bg-neutral-900">
						{events.map((event) => (
							<li key={event.id}>
								<Link
									href={`/admin/events/${event.slug}/submissions`}
									className="flex items-center justify-between px-4 py-3 text-sm hover:bg-neutral-800/50"
								>
									<span>
										<span className="font-medium text-neutral-100">{event.name}</span>
										<span className="mt-0.5 block text-neutral-500">{event.slug}</span>
									</span>
									<span className="text-neutral-400">→</span>
								</Link>
							</li>
						))}
					</ul>
				)}
			</section>

			{orphans.length > 0 ? (
				<section className="mb-10 space-y-3">
					<h2 className="text-sm font-medium uppercase tracking-wide text-neutral-500">
						Unowned events
					</h2>
					<p className="text-sm text-neutral-400">
						Seeded or orphaned events with no membership. First claimer becomes
						owner.
					</p>
					<ul className="divide-y divide-neutral-800 rounded-lg border border-neutral-800 bg-neutral-900">
						{orphans.map((event) => (
							<li key={event.id}>
								<ClaimOrphanButton
									eventSlug={event.slug}
									eventName={event.name}
								/>
							</li>
						))}
					</ul>
				</section>
			) : null}

			<section className="space-y-4">
				<h2 className="text-sm font-medium uppercase tracking-wide text-neutral-500">
					Create event
				</h2>
				<CreateEventForm
					canCreate={Boolean(account) || bypassActive}
					cloneSources={events.map((event) => ({ slug: event.slug, name: event.name }))}
				/>
			</section>
		</main>
	);
}
