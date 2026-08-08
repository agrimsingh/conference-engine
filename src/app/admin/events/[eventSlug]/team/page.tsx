import { AdminEventNav } from "@/components/admin-event-nav";
import { PageHeader } from "@/components/page-header";
import { assertCanManageEvent, isAdminBypass } from "@/lib/auth/admin";
import { getDb } from "@/lib/db/cloudflare";
import { listEventMembers } from "@/lib/db/queries";
import { InviteTeamForm } from "./invite-team-form";

type Props = {
	params: Promise<{ eventSlug: string }>;
};

export default async function AdminTeamPage({ params }: Props) {
	const { eventSlug } = await params;
	const db = await getDb();
	const access = await assertCanManageEvent(db, eventSlug);
	const members = await listEventMembers(db, access.event.id);
	const bypass = await isAdminBypass();
	const canRemove = access.membership?.role === "owner" || bypass;

	return (
		<div className="min-h-dvh bg-neutral-950 text-neutral-200">
			<AdminEventNav eventSlug={access.event.slug} />
			<main className="mx-auto max-w-2xl px-4 py-10">
				<PageHeader
					eyebrow="Organizer · Team"
					title="Event organizers"
					description="Invite teammates by email. They sign in with a magic link and get admin access to this event."
				/>
				<InviteTeamForm
					eventSlug={access.event.slug}
					canRemove={canRemove}
					initialMembers={members.map((member) => ({
						accountId: member.account_id,
						email: member.email,
						name: member.name,
						role: member.role,
						createdAt: member.created_at,
					}))}
				/>
			</main>
		</div>
	);
}
