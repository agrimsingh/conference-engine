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

	if (isCfpPastClosesAt(loaded.form, Date.now())) {
		return (
			<main className="min-h-screen bg-neutral-50 px-4 py-10 text-neutral-900">
				<div className="mx-auto max-w-2xl space-y-3">
					<p className="text-xs uppercase tracking-wide text-neutral-500">
						{loaded.event.name}
					</p>
					<h1 className="text-3xl font-semibold tracking-tight">CFP closed</h1>
					<p className="text-sm text-neutral-600">
						{loaded.form.title} is no longer accepting submissions.
					</p>
				</div>
			</main>
		);
	}

	return (
		<main className="min-h-screen bg-neutral-50 px-4 py-10 text-neutral-900">
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
