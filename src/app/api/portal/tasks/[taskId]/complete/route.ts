import { NextResponse } from "next/server";
import { getDb } from "@/lib/db/cloudflare";
import { completeTextTask } from "@/lib/speakers/complete-task";
import { readPortalSession } from "@/lib/speakers/portal-session";

type RouteContext = {
	params: Promise<{ taskId: string }>;
};

type Body = {
	token?: unknown;
	text?: unknown;
};

export async function POST(request: Request, context: RouteContext) {
	const { taskId } = await context.params;
	let body: Body;
	try {
		body = (await request.json()) as Body;
	} catch {
		return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
	}

	const token = typeof body.token === "string" ? body.token : "";
	const text = typeof body.text === "string" ? body.text : "";
	const session = await readPortalSession(token);
	if (!session) {
		return NextResponse.json({ ok: false, error: "Invalid or expired token" }, { status: 401 });
	}

	const db = await getDb();
	const result = await completeTextTask(db, {
		taskId,
		personId: session.personId,
		text,
	});

	if (!result.ok) {
		return NextResponse.json(
			{ ok: false, error: result.error },
			{ status: result.status },
		);
	}

	return NextResponse.json({ ok: true, task: result.task });
}
