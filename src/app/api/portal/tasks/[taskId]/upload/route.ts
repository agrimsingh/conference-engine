import { NextResponse } from "next/server";
import { getAuthSecret, getDb, getFilesBucket } from "@/lib/db/cloudflare";
import { broadcastEventInvalidate } from "@/lib/realtime/event-room";
import { completeFileTask } from "@/lib/speakers/complete-task";
import { readPortalSession, readPortalSessionFromCookie } from "@/lib/speakers/portal-session";
import { consumeFixedWindowRateLimit } from "@/lib/security/rate-limit";

type RouteContext = {
	params: Promise<{ taskId: string }>;
};

export async function POST(request: Request, context: RouteContext) {
	const { taskId } = await context.params;

	let form: FormData;
	try {
		form = await request.formData();
	} catch {
		return NextResponse.json({ ok: false, error: "Expected multipart form" }, { status: 400 });
	}

	const tokenValue = form.get("token");
	const token = typeof tokenValue === "string" ? tokenValue : "";
	const session = await readPortalSessionFromCookie() ?? await readPortalSession(token);
	if (!session) {
		return NextResponse.json({ ok: false, error: "Invalid or expired token" }, { status: 401 });
	}

	const fileValue = form.get("file");
	if (!(fileValue instanceof File)) {
		return NextResponse.json({ ok: false, error: "file required" }, { status: 400 });
	}

	const db = await getDb();
	const secret = await getAuthSecret();
	const ip = request.headers.get("cf-connecting-ip") ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
	const [personAllowed, ipAllowed] = await Promise.all([
		consumeFixedWindowRateLimit(db, { secret, bucket: "portal-upload-person", subject: `${session.personId}:${taskId}`, limit: 12, windowMs: 60 * 60_000 }),
		consumeFixedWindowRateLimit(db, { secret, bucket: "portal-upload-ip", subject: ip, limit: 30, windowMs: 60 * 60_000 }),
	]);
	if (!personAllowed || !ipAllowed) {
		return NextResponse.json({ ok: false, error: "Too many upload attempts; try again later" }, { status: 429 });
	}
	const files = await getFilesBucket();
	const result = await completeFileTask(db, files, {
		taskId,
		personId: session.personId,
		file: fileValue,
	});

	if (!result.ok) {
		return NextResponse.json(
			{ ok: false, error: result.error },
			{ status: result.status },
		);
	}

	const broadcasted = await broadcastEventInvalidate(
		result.task.event_id,
		"tasks.upload",
	);

	return NextResponse.json({
		ok: true,
		task: result.task,
		asset: result.asset,
		broadcasted,
	});
}
