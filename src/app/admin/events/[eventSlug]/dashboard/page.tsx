import { Suspense } from "react";
import dynamic from "next/dynamic";
import { AdminEventNav } from "@/components/admin-event-nav";
import { PageHeader } from "@/components/page-header";
import { assertCanManageEvent } from "@/lib/auth/admin";
import { loadCockpitSnapshot } from "@/lib/cockpit/snapshot";
import { getDb } from "@/lib/db/cloudflare";
import type { EventRow } from "@/lib/db/types";
import { loadProgramLifecycle } from "@/lib/events/load-program-lifecycle";
import { loadSubmissionPacingChart } from "@/lib/pacing/load";
import { ProgramLifecycleStrip } from "./program-lifecycle";
import { SubmissionPacingChart } from "./submission-pacing-chart";

const ProgramCockpit = dynamic(
	() => import("./program-cockpit").then((m) => ({ default: m.ProgramCockpit })),
	{ loading: () => <div className="h-64 animate-pulse rounded-lg bg-neutral-900" aria-hidden /> },
);

type Props = {
	params: Promise<{ eventSlug: string }>;
};

export default async function AdminDashboardPage({ params }: Props) {
	const { eventSlug } = await params;

	const db = await getDb();
	const { event } = await assertCanManageEvent(db, eventSlug);

	return (
		<div className="min-h-dvh bg-neutral-950 text-neutral-200">
			<AdminEventNav eventSlug={event.slug} />
			<main className="mx-auto max-w-5xl px-4 py-10">
				<PageHeader
					eyebrow="Organizer · Program"
					title={event.name}
					description="Work the program lifecycle in order. The cockpit lists every actionable blocker underneath."
				/>

				<Suspense fallback={<div className="h-64 animate-pulse rounded-lg bg-neutral-900" aria-hidden />}>
					<DashboardPanels db={db} event={event} />
				</Suspense>
			</main>
		</div>
	);
}

async function DashboardPanels({ db, event }: { db: D1Database; event: EventRow }) {
	const [snapshot, pacing] = await Promise.all([
		loadCockpitSnapshot(db, event),
		loadSubmissionPacingChart(db, event),
	]);
	const lifecycle = await loadProgramLifecycle(db, event, snapshot);

	return (
		<div className="space-y-10">
			<ProgramLifecycleStrip steps={lifecycle} />
			<section className="space-y-6">
				<header className="border-b border-neutral-800 pb-4">
					<h2 className="text-lg font-semibold text-neutral-100">Pipeline blockers</h2>
					<p className="mt-1 text-sm text-neutral-400">
						Live counts for review, notify, schedule, publish, and email retries.
					</p>
				</header>
				<SubmissionPacingChart chart={pacing} />
				<ProgramCockpit eventSlug={event.slug} initialSnapshot={snapshot} />
			</section>
		</div>
	);
}
