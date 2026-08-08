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
	const result = await sendTaskReminders(env, {
		eventId: event.id,
	});
	if (result.configurationError) {
		return NextResponse.json({ ok: false, error: result.configurationError }, { status: 503 });
	}

	return NextResponse.json({
		ok: true,
		sent: result.sent,
		skipped: result.skipped,
	});
}
