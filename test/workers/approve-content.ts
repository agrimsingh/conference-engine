import { env } from "cloudflare:workers";
import { setSessionContentStatus } from "@/lib/content/revisions";

/** Test fixture helper: public rows must traverse the same approval gate as production. */
export async function approveSessionContent(eventId: string, submissionId: string): Promise<void> {
	const result = await setSessionContentStatus(env.DB, {
		eventId,
		submissionId,
		status: "approved",
	});
	if (!result.ok) throw new Error(result.error);
}
