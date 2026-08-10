import { Suspense } from "react";
import { AdminEventNav } from "@/components/admin-event-nav";
import { PageHeader } from "@/components/page-header";
import { assertCanManageEvent, isAdminBypass } from "@/lib/auth/admin";
import { getDb } from "@/lib/db/cloudflare";
import { listEventMembers } from "@/lib/db/queries";
import { loadEventConfiguration } from "@/lib/events/configuration";
import { SettingsEditor } from "./settings-editor";

type Props = { params: Promise<{ eventSlug: string }> };

export default async function EventSettingsPage({ params }: Props) {
	const { eventSlug } = await params;
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
				<Suspense
					fallback={
						<p className="mt-8 text-sm text-neutral-500">Loading settings…</p>
					}
				>
					<SettingsEditor
						eventSlug={access.event.slug}
						configuration={configuration}
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
				</Suspense>
			</main>
		</div>
	);
}
