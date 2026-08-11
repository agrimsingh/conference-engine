import { AdminEventNav } from "@/components/admin-event-nav";
import { PageHeader } from "@/components/page-header";
import { assertCanManageEvent, isAdminBypass } from "@/lib/auth/admin";
import { getDb } from "@/lib/db/cloudflare";
import { listEventMembers } from "@/lib/db/queries";
import { loadEventConfiguration } from "@/lib/events/configuration";
import { SettingsEditor } from "./settings-editor";
import { parseSection } from "./settings-section";

type Props = {
	params: Promise<{ eventSlug: string }>;
	searchParams: Promise<{ section?: string }>;
};

export default async function EventSettingsPage({ params, searchParams }: Props) {
	const { eventSlug } = await params;
	const { section: sectionParam } = await searchParams;
	const db = await getDb();
	const access = await assertCanManageEvent(db, eventSlug);
	const [configuration, members, bypass] = await Promise.all([
		loadEventConfiguration(db, access.event.id),
		listEventMembers(db, access.event.id),
		isAdminBypass(),
	]);

	return (
		<div className="min-h-dvh bg-neutral-950 text-neutral-200">
			<AdminEventNav eventSlug={access.event.slug} />
			<main className="mx-auto max-w-6xl px-4 py-10">
				<PageHeader
					eyebrow="Organizer settings"
					title={access.event.name}
					description="Event defaults, team access, API tokens, rooms, tracks, and speaker task templates."
				/>
				<SettingsEditor
					eventSlug={access.event.slug}
					configuration={configuration}
					initialSection={parseSection(sectionParam ?? null)}
					team={{
						members: members.map((member) => ({
							accountId: member.account_id,
							email: member.email,
							name: member.name,
							role: member.role,
							createdAt: member.created_at,
						})),
						canRemove: access.membership?.role === "owner" || bypass,
						canTransfer: access.membership?.role === "owner" || bypass,
						canInviteAsOwner: access.membership?.role === "owner" || bypass,
						currentAccountId: access.account?.id ?? null,
						currentRole: access.membership?.role ?? null,
					}}
				/>
			</main>
		</div>
	);
}
