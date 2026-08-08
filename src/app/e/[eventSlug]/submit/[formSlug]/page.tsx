import { notFound } from "next/navigation";
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
