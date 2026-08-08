import Link from "next/link";
import { AdminEventNav } from "@/components/admin-event-nav";
import { PageHeader } from "@/components/page-header";
import { assertCanManageEvent } from "@/lib/auth/admin";
import { listFormsForEvent } from "@/lib/cfp/form-admin";
import { getDb } from "@/lib/db/cloudflare";
import { CreateFormButton } from "./create-form-button";

type Props = {
	params: Promise<{ eventSlug: string }>;
};

export default async function AdminFormsPage({ params }: Props) {
	const { eventSlug } = await params;
	const db = await getDb();
	const { event } = await assertCanManageEvent(db, eventSlug);

	const forms = await listFormsForEvent(db, event.id);

	return (
		<div className="min-h-dvh bg-neutral-950 text-neutral-200">
			<AdminEventNav eventSlug={eventSlug} />
			<main className="mx-auto max-w-3xl px-4 py-10">
				<PageHeader
					eyebrow="CFP"
					title="Forms"
					description="Edit field definitions for each call for papers. Changes apply to new submissions immediately."
				/>
				<CreateFormButton eventSlug={eventSlug} />
				<ul className="mt-8 divide-y divide-neutral-800 rounded-lg border border-neutral-800 bg-neutral-900">
					{forms.map((form) => (
						<li key={form.id}>
							<Link
								href={`/admin/events/${eventSlug}/forms/${form.slug}`}
								className="flex items-center justify-between gap-4 px-4 py-4 hover:bg-neutral-900/80"
							>
								<span>
									<span className="block font-medium text-neutral-100">
										{form.title}
									</span>
									<span className="mt-0.5 block text-xs text-neutral-500">
										/{form.slug} · {form.status}
									</span>
								</span>
								<span className="text-sm text-emerald-400">Edit fields →</span>
							</Link>
						</li>
					))}
					{forms.length === 0 ? (
						<li className="px-4 py-8 text-center text-sm text-neutral-500">
							No forms yet. Seed an event or insert a cfp_forms row.
						</li>
					) : null}
				</ul>
			</main>
		</div>
	);
}
