import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AdminEventNav } from "@/components/admin-event-nav";
import { PageHeader } from "@/components/page-header";
import { isAdminBypass } from "@/lib/auth/admin";
import { rowToFieldDef } from "@/lib/cfp/form-admin";
import { getDb } from "@/lib/db/cloudflare";
import { getEventBySlug, getFormBySlug, listFormFields } from "@/lib/db/queries";
import { FormBuilder } from "./form-builder";

type Props = {
	params: Promise<{ eventSlug: string; formSlug: string }>;
};

export default async function AdminFormBuilderPage({ params }: Props) {
	if (!(await isAdminBypass())) redirect("/admin/bypass");

	const { eventSlug, formSlug } = await params;
	const db = await getDb();
	const event = await getEventBySlug(db, eventSlug);
	if (!event) notFound();
	const form = await getFormBySlug(db, event.id, formSlug);
	if (!form) notFound();

	const rows = await listFormFields(db, form.id);
	const fields = rows.map((row) => ({
		id: row.id,
		...rowToFieldDef(row),
		config: JSON.parse(row.config) as Record<string, unknown>,
	}));

	return (
		<div className="min-h-dvh bg-neutral-950 text-neutral-200">
			<AdminEventNav eventSlug={eventSlug} />
			<main className="mx-auto max-w-3xl px-4 py-10">
				<p className="mb-4 text-sm">
					<Link
						href={`/admin/events/${eventSlug}/forms`}
						className="text-neutral-400 hover:text-neutral-100"
					>
						← All forms
					</Link>
					{" · "}
					<Link
						href={`/e/${eventSlug}/submit/${formSlug}`}
						className="text-emerald-400 hover:text-emerald-300"
					>
						Preview public CFP
					</Link>
				</p>
				<PageHeader
					eyebrow="Form builder"
					title={form.title}
					description={`Slug ${form.slug}. Soft-delete preserves historical answers keyed by field key.`}
				/>
				<div className="mt-8">
					<FormBuilder
						eventSlug={eventSlug}
						formSlug={formSlug}
						initialTitle={form.title}
						initialStatus={form.status}
						initialFields={fields}
					/>
				</div>
			</main>
		</div>
	);
}
