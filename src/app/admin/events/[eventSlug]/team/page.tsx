import { redirect } from "next/navigation";

type Props = {
	params: Promise<{ eventSlug: string }>;
};

export default async function AdminTeamPage({ params }: Props) {
	const { eventSlug } = await params;
	redirect(`/admin/events/${eventSlug}/settings?section=team`);
}
