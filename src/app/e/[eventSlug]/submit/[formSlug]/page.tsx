import Link from "next/link";
import { notFound } from "next/navigation";
import { isCfpBeforeOpensAt, isCfpOpenNow } from "@/lib/cfp/closes-at";
import { loadCfpForm } from "@/lib/cfp/load-form";
import { loadDraftForResume } from "@/lib/cfp/drafts";
import { renderFormCopy } from "@/lib/cfp/form-copy";
import { getAuthSecret, getDb } from "@/lib/db/cloudflare";
import { CfpForm } from "./cfp-form";

type Props = {
	params: Promise<{ eventSlug: string; formSlug: string }>;
	searchParams: Promise<{ draft?: string }>;
};

export default async function PublicCfpPage({ params, searchParams }: Props) {
	const { eventSlug, formSlug } = await params;
	const { draft } = await searchParams;
	const db = await getDb();
	const loaded = await loadCfpForm(db, eventSlug, formSlug);
	if (!loaded) notFound();

	// eslint-disable-next-line react-hooks/purity -- request-time lifecycle check in a server component
	const now = Date.now();
	// Draft forms stay private. Closed (or not-yet-open) forms render a real page
	// so public schedule / share links don't hard-404 — especially the read-only demo.
	if (loaded.form.status === "draft") notFound();
	if (loaded.form.status !== "open" || !isCfpOpenNow(loaded.form, now)) {
		const opensLater = loaded.form.status === "open" && isCfpBeforeOpensAt(loaded.form, now);
		const isDemo = loaded.event.mode === "demo";
		return (
			<main className="px-4 py-10">
				<div className="mx-auto max-w-2xl space-y-3 rounded-lg border border-neutral-800 bg-neutral-900 px-5 py-8">
					<p className="text-xs font-medium uppercase tracking-wide text-neutral-500">
						{loaded.event.name} · Call for proposals
					</p>
					<h1 className="text-balance text-3xl font-semibold tracking-tight text-neutral-100">
						{opensLater ? "CFP opens soon" : "CFP closed"}
					</h1>
					<p className="text-pretty text-sm text-neutral-400">
						{opensLater
							? `${loaded.form.title} is not accepting proposals yet. Please return after the announced opening time.`
							: isDemo
								? `${loaded.form.title} is not open for browsing right now. Try the demo launcher, create your own event to submit for real, or open the public schedule.`
								: `${loaded.form.title} is no longer accepting submissions.`}
					</p>
					{isDemo ? (
						<p className="flex flex-wrap gap-4 pt-2 text-sm">
							<Link
								className="font-medium text-emerald-400 underline underline-offset-2 hover:text-emerald-300"
								href="/demo?perspective=applicant"
							>
								Demo launcher
							</Link>
							<Link
								className="font-medium text-neutral-200 underline underline-offset-2 hover:text-neutral-100"
								href={`/e/${eventSlug}/schedule`}
							>
								Public schedule
							</Link>
							<Link
								className="font-medium text-neutral-200 underline underline-offset-2 hover:text-neutral-100"
								href="/admin"
							>
								Create your event
							</Link>
						</p>
					) : null}
				</div>
			</main>
		);
	}
	if (typeof draft === "string" && draft) {
		const saved = await loadDraftForResume(db, { secret: await getAuthSecret(), token: draft });
		if (!saved || saved.eventId !== loaded.event.id || saved.formId !== loaded.form.id || loaded.form.drafts_enabled !== 1) notFound();
	}

	return (
		<main className="px-4 py-10">
			<CfpForm
				eventSlug={eventSlug}
				formSlug={formSlug}
				eventName={loaded.event.name}
				formTitle={loaded.form.title}
				formDescription={loaded.form.description}
				welcomeCopy={loaded.form.welcome_copy ? renderFormCopy(loaded.form.welcome_copy, { eventName: loaded.event.name, submitterName: "there", title: loaded.form.title }) : null}
				thankYouCopy={loaded.form.thank_you_copy ?? null}
				draftToken={typeof draft === "string" ? draft : ""}
				draftsEnabled={loaded.form.drafts_enabled === 1}
				submissionLimit={loaded.form.submission_limit}
				fields={loaded.fields}
				sections={loaded.sections}
				readOnly={loaded.event.mode === "demo"}
			/>
		</main>
	);
}
