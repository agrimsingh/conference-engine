import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminEventNav } from "@/components/admin-event-nav";
import { PageHeader } from "@/components/page-header";
import { assertCanManageEvent } from "@/lib/auth/admin";
import { rowToFieldDef, countFormSubmissions } from "@/lib/cfp/form-admin";
import { getDb } from "@/lib/db/cloudflare";
import { getFormBySlug, listFormFields } from "@/lib/db/queries";
import dynamic from "next/dynamic";
import { parseCategoryRoute } from "@/lib/domain/category-routing";
import { parseFormSections } from "@/lib/domain/form-sections";
import { parseFormBuilderSection } from "./form-builder-section";

const FormBuilder = dynamic(
	() => import("./form-builder").then((m) => ({ default: m.FormBuilder })),
	{ loading: () => <div className="h-64 animate-pulse rounded-lg bg-neutral-900" aria-hidden /> },
);

type Props = {
	params: Promise<{ eventSlug: string; formSlug: string }>;
	searchParams: Promise<{ section?: string }>;
};

export default async function AdminFormBuilderPage({ params, searchParams }: Props) {
	const { eventSlug, formSlug } = await params;
	const { section: sectionParam } = await searchParams;
	const initialSection = parseFormBuilderSection(sectionParam);
	const db = await getDb();
	const { event } = await assertCanManageEvent(db, eventSlug);
	const form = await getFormBySlug(db, event.id, formSlug);
	if (!form) notFound();

	const [rows, submissionCount] = await Promise.all([
		listFormFields(db, form.id),
		countFormSubmissions(db, form.id),
	]);
	const fields = rows.map((row) => {
		const def = rowToFieldDef(row);
		return {
			id: row.id,
			...def,
			config: def.config as Record<string, unknown>,
		};
	});

	return (
		<div className="min-h-dvh bg-neutral-950 text-neutral-200">
			<AdminEventNav eventSlug={eventSlug} />
			<main className="mx-auto max-w-6xl px-4 py-10">
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
						initialSection={initialSection}
						initialTitle={form.title}
						initialDescription={form.description ?? ""}
						initialStatus={form.status}
						initialOpensAt={form.opens_at}
						initialClosesAt={form.closes_at}
						initialCategoryRoute={parseCategoryRoute(form.category_routing_json)}
						initialMinSpeakers={form.min_speakers}
						initialMaxSpeakers={form.max_speakers}
						initialDraftsEnabled={form.drafts_enabled === 1}
						initialSubmissionLimit={form.submission_limit}
						initialWelcomeCopy={form.welcome_copy ?? ""}
						initialConfirmationCopy={form.confirmation_copy ?? ""}
						initialReminderCopy={form.reminder_copy ?? ""}
						initialThankYouCopy={form.thank_you_copy ?? ""}
						initialSections={parseFormSections(form.sections_json)}
						initialSubmissionCount={submissionCount}
						initialFields={fields}
					/>
				</div>
			</main>
		</div>
	);
}
