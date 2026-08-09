import { PublicSessionDetail } from "@/components/public-session-detail";

export default function PublicSessionPage({ params }: { params: Promise<{ eventSlug: string; sessionId: string }> }) {
	return <PublicSessionDetail params={params} basePath="/e" />;
}
