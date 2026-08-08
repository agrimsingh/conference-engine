import { NextResponse } from "next/server";
import { getAuthSecret, getDb, getFilesBucket } from "@/lib/db/cloudflare";
import { broadcastEventInvalidate } from "@/lib/realtime/event-room";
import { completeFileTask } from "@/lib/speakers/complete-task";
import { readPortalSessionFromCookie } from "@/lib/speakers/portal-session";
import { consumeFixedWindowRateLimit } from "@/lib/security/rate-limit";

type RouteContext = {
	params: Promise<{ taskId: string }>;
};

const MAX_UPLOAD_BYTES = 25 * 1024 * 1024 + 512 * 1024;

export async function POST(request: Request, context: RouteContext) {
	const { taskId } = await context.params;
	const session = await readPortalSessionFromCookie();
	if (!session) {
		return NextResponse.json({ ok: false, error: "Invalid or expired token" }, { status: 401 });
	}
	const declaredLength = Number(request.headers.get("content-length"));
	if (Number.isFinite(declaredLength) && declaredLength > MAX_UPLOAD_BYTES) {
		return NextResponse.json({ ok: false, error: "Upload too large (max 25MB)" }, { status: 413 });
	}

	let form: FormData;
	try {
		form = await boundedMultipartRequest(request, MAX_UPLOAD_BYTES).formData();
	} catch (error) {
		if (error instanceof Error && error.message === "Upload too large") {
			return NextResponse.json({ ok: false, error: "Upload too large (max 25MB)" }, { status: 413 });
		}
		return NextResponse.json({ ok: false, error: "Expected multipart form" }, { status: 400 });
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

function boundedMultipartRequest(request: Request, maxBytes: number): Request {
	if (!request.body) throw new Error("Missing multipart body");
	const reader = request.body.getReader();
	let seen = 0;
	const body = new ReadableStream<Uint8Array>({
		async pull(controller) {
			const { done, value } = await reader.read();
			if (done) {
				controller.close();
				reader.releaseLock();
				return;
			}
			seen += value.byteLength;
			if (seen > maxBytes) {
				await reader.cancel();
				reader.releaseLock();
				controller.error(new Error("Upload too large"));
				return;
			}
			controller.enqueue(value);
		},
		async cancel() {
			await reader.cancel();
			reader.releaseLock();
		},
	});
	return new Request(request, { body });
}
