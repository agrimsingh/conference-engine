import { NextResponse } from "next/server";
import { authorizeWritableEventAdminApi } from "@/lib/auth/admin";
import { isJsonObject, readBoundedJson } from "@/lib/cfp/request";
import { getCloudflareEnv, getDb } from "@/lib/db/cloudflare";
import { sendTaskReminders } from "@/lib/email/reminders";

type RouteContext = {
	params: Promise<{ eventSlug: string }>;
};

export async function POST(request: Request, context: RouteContext) {
	const { eventSlug } = await context.params;
	const db = await getDb();
	const authorization = await authorizeWritableEventAdminApi(db, eventSlug);
	if (!authorization.ok) return authorization.response;
	const event = authorization.access.event;

	let personIds: string[] | undefined;
	const contentType = request.headers.get("content-type") ?? "";
	if (contentType.includes("application/json")) {
		const parsed = await readBoundedJson(request, 16 * 1024);
		if (!parsed.ok || !isJsonObject(parsed.value)) return NextResponse.json({ ok: false, error: parsed.ok ? "Expected JSON object" : parsed.error }, { status: parsed.ok ? 400 : parsed.status });
		const raw = parsed.value.personIds;
		if (raw !== undefined) {
			if (!Array.isArray(raw) || raw.length === 0 || raw.length > 100 || raw.some((value) => typeof value !== "string" || !value.trim())) return NextResponse.json({ ok: false, error: "personIds must contain 1 to 100 non-empty strings" }, { status: 400 });
			personIds = [...new Set(raw.map((value) => value.trim()))];
		}
	}
	const env = await getCloudflareEnv();
	const result = await sendTaskReminders(env, {
		eventId: event.id,
		personIds,
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
