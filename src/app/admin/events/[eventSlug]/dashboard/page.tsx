import { Suspense } from "react";
import dynamic from "next/dynamic";
import { AdminEventNav } from "@/components/admin-event-nav";
import { PageHeader } from "@/components/page-header";
import { assertCanManageEvent } from "@/lib/auth/admin";
import { loadCockpitSnapshot } from "@/lib/cockpit/snapshot";
import { getDb } from "@/lib/db/cloudflare";
import type { EventRow } from "@/lib/db/types";
import { loadSubmissionPacingChart } from "@/lib/pacing/load";
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
					eyebrow="Organizer · Program cockpit"
					title={event.name}
					description="Every pipeline blocker in one place: review, decide, remind, schedule, publish, retry."
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

	return (
		<>
			<SubmissionPacingChart chart={pacing} />
			<ProgramCockpit eventSlug={event.slug} initialSnapshot={snapshot} />
		</>
	);
}
