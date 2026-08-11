import Link from "next/link";
import { redirect } from "next/navigation";
import { AppNav } from "@/components/app-nav";
import { PageHeader } from "@/components/page-header";
import { buttonClasses } from "@/components/ui";
import {
	getCurrentOrganizerAccount,
	hasAdminAccess,
	isAdminBypass,
	listAccessibleEvents,
} from "@/lib/auth/admin";
import {
	getContactKpis,
	listAccountContacts,
	listContactSegments,
	listFilterOptions,
	getPipelineBoard,
	isContactPipelineStage,
	type ContactFilters,
} from "@/lib/contacts";
import { getDb } from "@/lib/db/cloudflare";
import { ContactsConsole, parseContactsView } from "./contacts-console";

type Props = {
	searchParams: Promise<{
		q?: string;
		company?: string;
		title?: string;
		tag?: string;
		stage?: string;
		view?: string;
		segment?: string;
	}>;
};

export default async function AdminContactsPage({ searchParams }: Props) {
	const params = await searchParams;
	const db = await getDb();
	const allowed = await hasAdminAccess(db);
	if (!allowed) {
		redirect(`/login?next=${encodeURIComponent("/admin/contacts")}`);
	}

	const account = await getCurrentOrganizerAccount(db);
	const bypassActive = await isAdminBypass();
	if (!account) {
		return (
			<>
				<AppNav ariaLabel="Organizer">
					<div className="ml-auto flex items-center gap-3 text-sm">
						<Link href="/admin" className="text-neutral-300 hover:text-neutral-100">
							Events
						</Link>
					</div>
				</AppNav>
				<main className="mx-auto max-w-5xl px-4 py-10">
					<PageHeader
						eyebrow="Contacts"
						title="Speaker contacts"
						description="Sign in with an organizer account to manage your cross-event speaker directory."
					/>
					{bypassActive ? (
						<p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
							Bypass is active but contacts are account-scoped.{" "}
							<Link href="/login?next=/admin/contacts" className="underline underline-offset-2">
								Sign in
							</Link>{" "}
							to continue.
						</p>
					) : (
						<Link href="/login?next=/admin/contacts" className={buttonClasses("primary")}>
							Sign in
						</Link>
					)}
				</main>
			</>
		);
	}

	const filters: ContactFilters = {
		q: params.q,
		company: params.company,
		title: params.title,
		tag: params.tag,
		stage:
			params.stage === "all" || !params.stage
				? "all"
				: isContactPipelineStage(params.stage)
					? params.stage
					: "all",
	};

	const [{ events }, contacts, options, kpis, board, segments] = await Promise.all([
		listAccessibleEvents(db),
		listAccountContacts(db, account.id, filters),
		listFilterOptions(db, account.id),
		getContactKpis(db, account.id),
		getPipelineBoard(db, account.id),
		listContactSegments(db, account.id),
	]);

	return (
		<>
			<AppNav ariaLabel="Organizer">
				<div className="ml-2 flex items-center gap-3 text-sm">
					<Link
						href="/admin"
						className="rounded-md px-2 py-1 text-neutral-400 hover:bg-neutral-900 hover:text-neutral-100"
					>
						Events
					</Link>
					<span className="rounded-md bg-neutral-900 px-2 py-1 font-medium text-neutral-100">
						Contacts
					</span>
				</div>
			</AppNav>
			<main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
				<PageHeader
					eyebrow="Organizer"
					title="Contacts"
					description={`Cross-event speaker directory for ${account.email}. Import once, reuse across every event you own.`}
				/>
				<ContactsConsole
					initialContacts={contacts}
					initialFilters={filters}
					initialOptions={options}
					initialKpis={kpis}
					initialBoard={board}
					initialSegments={segments}
					events={events.map((event) => ({ id: event.id, slug: event.slug, name: event.name }))}
					initialView={parseContactsView(params.view)}
					initialSegmentId={params.segment ?? null}
				/>
			</main>
		</>
	);
}
