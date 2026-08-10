import { redirect } from "next/navigation";

export default async function ContentPage({
	params,
}: {
	params: Promise<{ eventSlug: string }>;
}) {
	const { eventSlug } = await params;
	redirect(`/admin/events/${eventSlug}/speakers?panel=content-sessions`);
}
