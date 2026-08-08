import { PublicSchedule } from "@/components/public-schedule";

type Props = {
	params: Promise<{ eventSlug: string }>;
	searchParams: Promise<{ day?: string; view?: string; room?: string }>;
};

export default function EmbedSchedulePage(props: Props) {
	return <PublicSchedule {...props} basePath="/embed" />;
}
