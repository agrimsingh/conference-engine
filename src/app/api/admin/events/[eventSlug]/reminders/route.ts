import { NextResponse } from "next/server";
import { isAdminBypass } from "@/lib/auth/admin";
import { getCloudflareEnv, getDb } from "@/lib/db/cloudflare";
import { getEventBySlug } from "@/lib/db/queries";
import { sendTaskReminders } from "@/lib/email/reminders";

type RouteContext = {
	params: Promise<{ eventSlug: string }>;
};

export async function POST(request: Request, context: RouteContext) {
	if (!(await isAdminBypass())) {
		return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
	}

	const { eventSlug } = await context.params;
	const db = await getDb();
	const event = await getEventBySlug(db, eventSlug);
	if (!event) {
		return NextResponse.json({ ok: false, error: "Event not found" }, { status: 404 });
	}

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
