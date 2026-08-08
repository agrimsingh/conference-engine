import { NextResponse } from "next/server";
import { getDb, getFilesBucket } from "@/lib/db/cloudflare";
import { completeFileTask } from "@/lib/speakers/complete-task";
import { readPortalSession } from "@/lib/speakers/portal-session";

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
	const session = await readPortalSession(token);
	if (!session) {
		return NextResponse.json({ ok: false, error: "Invalid or expired token" }, { status: 401 });
	}

	const fileValue = form.get("file");
	if (!(fileValue instanceof File)) {
		return NextResponse.json({ ok: false, error: "file required" }, { status: 400 });
	}

	const db = await getDb();
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

	return NextResponse.json({
		ok: true,
		task: result.task,
		asset: result.asset,
	});
}
