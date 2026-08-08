import { notFound } from "next/navigation";
import { isCfpPastClosesAt } from "@/lib/cfp/closes-at";
import { loadCfpForm } from "@/lib/cfp/load-form";
import { getDb } from "@/lib/db/cloudflare";
import { CfpForm } from "./cfp-form";

type Props = {
	params: Promise<{ eventSlug: string; formSlug: string }>;
};

export default async function PublicCfpPage({ params }: Props) {
	const { eventSlug, formSlug } = await params;
	const db = await getDb();
	const loaded = await loadCfpForm(db, eventSlug, formSlug, { requireOpen: true });
	if (!loaded) notFound();

	// eslint-disable-next-line react-hooks/purity -- request-time close check in a server component
	if (isCfpPastClosesAt(loaded.form, Date.now())) {
		return (
			<main className="px-4 py-10">
				<div className="mx-auto max-w-2xl space-y-3 rounded-lg border border-neutral-800 bg-neutral-900 px-5 py-8">
					<p className="text-xs font-medium uppercase tracking-wide text-neutral-500">
						{loaded.event.name} · Call for proposals
					</p>
					<h1 className="text-balance text-3xl font-semibold tracking-tight text-neutral-100">
						CFP closed
					</h1>
					<p className="text-pretty text-sm text-neutral-400">
						{loaded.form.title} is no longer accepting submissions.
					</p>
				</div>
			</main>
		);
	}

	return (
		<main className="px-4 py-10">
			<CfpForm
				eventSlug={eventSlug}
				formSlug={formSlug}
				eventName={loaded.event.name}
				formTitle={loaded.form.title}
				formDescription={loaded.form.description}
				fields={loaded.fields}
			/>
		</main>
	);
}
