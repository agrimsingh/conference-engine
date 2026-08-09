import { NextResponse } from "next/server";
import { readBoundedJson } from "@/lib/cfp/request";
import { getDb } from "@/lib/db/cloudflare";
import { broadcastEventInvalidate } from "@/lib/realtime/event-room";
import { completeFormTask, completeTextTask } from "@/lib/speakers/complete-task";
import { readPortalSessionFromCookie } from "@/lib/speakers/portal-session";

type RouteContext = {
	params: Promise<{ taskId: string }>;
};

type Body = {
	text?: unknown;
	answers?: unknown;
};

const MAX_PORTAL_TEXT_REQUEST_BYTES = 64 * 1024;

export async function POST(request: Request, context: RouteContext) {
	const { taskId } = await context.params;
	const session = await readPortalSessionFromCookie();
	if (!session) {
		return NextResponse.json({ ok: false, error: "Invalid or expired token" }, { status: 401 });
	}
	const parsed = await readBoundedJson(request, MAX_PORTAL_TEXT_REQUEST_BYTES);
	if (!parsed.ok || typeof parsed.value !== "object" || parsed.value === null || Array.isArray(parsed.value)) {
		return NextResponse.json({ ok: false, error: parsed.ok ? "Expected JSON object" : parsed.error }, { status: parsed.ok ? 400 : parsed.status });
	}
	const body = parsed.value as Body;
	const text = typeof body.text === "string" ? body.text : "";

	const db = await getDb();
	const result = body.answers === undefined
		? await completeTextTask(db, { taskId, personId: session.personId, text })
		: await completeFormTask(db, { taskId, personId: session.personId, answers: body.answers });

	if (!result.ok) {
		return NextResponse.json(
			{ ok: false, error: result.error },
			{ status: result.status },
		);
	}

	const broadcasted = await broadcastEventInvalidate(
		result.task.event_id,
		"tasks.complete",
	);

	return NextResponse.json({ ok: true, task: result.task, broadcasted });
}
