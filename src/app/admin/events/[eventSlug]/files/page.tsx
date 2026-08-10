import { redirect } from "next/navigation";

export default async function FilesPage({
	params,
}: {
	params: Promise<{ eventSlug: string }>;
}) {
	const { eventSlug } = await params;
	redirect(`/admin/events/${eventSlug}/tasks?section=library`);
}
