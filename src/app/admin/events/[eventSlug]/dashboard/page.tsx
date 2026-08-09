import { AdminEventNav } from "@/components/admin-event-nav";
import { PageHeader } from "@/components/page-header";
import { assertCanManageEvent } from "@/lib/auth/admin";
import { loadCockpitSnapshot } from "@/lib/cockpit/snapshot";
import { getDb } from "@/lib/db/cloudflare";
import { loadSubmissionPacingChart } from "@/lib/pacing/load";
import { ProgramCockpit } from "./program-cockpit";
import { SubmissionPacingChart } from "./submission-pacing-chart";

type Props = {
	params: Promise<{ eventSlug: string }>;
};

export default async function AdminDashboardPage({ params }: Props) {
	const { eventSlug } = await params;

	const db = await getDb();
	const { event } = await assertCanManageEvent(db, eventSlug);

	const [snapshot, pacing] = await Promise.all([
		loadCockpitSnapshot(db, event),
		loadSubmissionPacingChart(db, event),
	]);

	return (
		<div className="min-h-dvh bg-neutral-950 text-neutral-200">
			<AdminEventNav eventSlug={event.slug} />
			<main className="mx-auto max-w-5xl px-4 py-10">
				<PageHeader
					eyebrow="Organizer · Program cockpit"
					title={event.name}
					description="Every pipeline blocker in one place: review, decide, remind, schedule, publish, retry."
				/>

				<SubmissionPacingChart chart={pacing} />
				<ProgramCockpit eventSlug={event.slug} initialSnapshot={snapshot} />
			</main>
		</div>
	);
}
