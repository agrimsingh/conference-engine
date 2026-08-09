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
	const nextIncomplete = readiness.find((item) => !item.complete);
	const nextIndex = nextIncomplete ? readiness.findIndex((item) => item.key === nextIncomplete.key) : -1;

	return (
		<div className="min-h-dvh bg-neutral-950 text-neutral-200">
			<AdminEventNav eventSlug={event.slug} />
			<main className="mx-auto max-w-3xl px-4 py-10">
				<PageHeader
					eyebrow="Organizer setup"
					title={event.name}
					description={`${complete} of ${readiness.length} essentials are ready. Work the list in order, then open your CFP.`}
				/>

				{nextIncomplete ? (
					<div className="mt-6 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
						<span className="font-medium">Next up · Step {nextIndex + 1}:</span>{" "}
						{nextIncomplete.label}. {nextIncomplete.detail}{" "}
						<Link href={nextIncomplete.href} className="underline underline-offset-2 hover:text-white">
							Continue →
						</Link>
					</div>
				) : (
					<div className="mt-6 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
						Setup essentials are complete. Open the CFP when you are ready for proposals.
					</div>
				)}

				<ol className="mt-8 divide-y divide-neutral-800 overflow-hidden rounded-lg border border-neutral-800 bg-neutral-900">
					{readiness.map((item, index) => {
						const isNext = nextIncomplete?.key === item.key;
						return (
							<li key={item.key} className={isNext ? "bg-neutral-800/40" : undefined}>
								<Link
									href={item.href}
									className="flex items-center justify-between gap-4 px-4 py-4 hover:bg-neutral-800/60"
								>
									<span className="flex min-w-0 items-start gap-3">
										<span
											className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-medium ${
												item.complete
													? "bg-emerald-500/20 text-emerald-300"
													: isNext
														? "bg-amber-500/20 text-amber-200"
														: "bg-neutral-800 text-neutral-500"
											}`}
										>
											{item.complete ? "✓" : index + 1}
										</span>
										<span>
											<span className="block font-medium text-neutral-100">
												{item.complete ? "Ready" : isNext ? "Current" : "Later"} · {item.label}
											</span>
											<span className="mt-1 block text-sm text-neutral-400">{item.detail}</span>
										</span>
									</span>
									<span className={item.complete ? "text-sm text-emerald-400" : "text-sm text-amber-300"}>
										{item.complete ? "Review" : "Set up"} →
									</span>
								</Link>
							</li>
						);
					})}
				</ol>

				<div className="mt-8 flex flex-wrap gap-3 text-sm">
					<Link
						href={`/admin/events/${event.slug}/forms`}
						className="rounded-md border border-neutral-700 px-3 py-2 text-neutral-200 hover:bg-neutral-800"
					>
						Manage CFP
					</Link>
					<Link
						href={`/admin/events/${event.slug}/submissions`}
						className="rounded-md border border-neutral-700 px-3 py-2 text-neutral-200 hover:bg-neutral-800"
					>
						Review submissions
					</Link>
					<Link
						href={`/admin/events/${event.slug}/schedule`}
						className="rounded-md border border-neutral-700 px-3 py-2 text-neutral-200 hover:bg-neutral-800"
					>
						Open schedule
					</Link>
				</div>
			</main>
		</div>
	);
}
