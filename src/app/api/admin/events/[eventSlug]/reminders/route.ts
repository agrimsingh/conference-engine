import { NextResponse } from "next/server";
import { authorizeEventAdminApi } from "@/lib/auth/admin";
import { getCloudflareEnv, getDb } from "@/lib/db/cloudflare";
import { sendTaskReminders } from "@/lib/email/reminders";

type RouteContext = {
	params: Promise<{ eventSlug: string }>;
};

export async function POST(request: Request, context: RouteContext) {
	const { eventSlug } = await context.params;
	const db = await getDb();
	const access = await authorizeEventAdminApi(db, eventSlug);
	if (!access) {
		return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
	}
	const event = access.event;

	const env = await getCloudflareEnv();
	const portalBaseUrl = new URL(request.url).origin;
	const result = await sendTaskReminders(env, {
		eventId: event.id,
		portalBaseUrl,
	});

	return NextResponse.json({
		ok: true,
		sent: result.sent,
		skipped: result.skipped,
	});
}
