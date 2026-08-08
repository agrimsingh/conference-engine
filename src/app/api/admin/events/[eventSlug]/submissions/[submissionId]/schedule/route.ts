import { NextResponse } from "next/server";
import { authorizeEventAdminApi } from "@/lib/auth/admin";
import { getDb } from "@/lib/db/cloudflare";
import { getSubmissionById } from "@/lib/db/queries";
import { scheduleSubmission } from "@/lib/schedule/schedule";

type RouteContext = {
	params: Promise<{ eventSlug: string; submissionId: string }>;
};

type Body = {
	startsAt?: unknown;
	endsAt?: unknown;
	roomName?: unknown;
};

function parseTime(value: unknown): number | null {
	if (typeof value === "number" && Number.isFinite(value)) return value;
	if (typeof value === "string" && value.trim()) {
		const ms = Date.parse(value);
		if (!Number.isNaN(ms)) return ms;
	}
	return null;
}

export async function POST(request: Request, context: RouteContext) {
	const { eventSlug, submissionId } = await context.params;
	let body: Body;
	try {
		body = (await request.json()) as Body;
	} catch {
		return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
	}

	const startsAtMs = parseTime(body.startsAt);
	const endsAtMs = parseTime(body.endsAt);
	const roomName = typeof body.roomName === "string" ? body.roomName : "";

	if (startsAtMs === null || endsAtMs === null) {
		return NextResponse.json(
			{ ok: false, error: "startsAt and endsAt required (ISO or ms)" },
			{ status: 400 },
		);
	}

	const db = await getDb();
	const access = await authorizeEventAdminApi(db, eventSlug);
	if (!access) {
		return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
	}
	const event = access.event;

	const submission = await getSubmissionById(db, submissionId);
	if (!submission || submission.event_id !== event.id) {
		return NextResponse.json({ ok: false, error: "Submission not found" }, { status: 404 });
	}

	const result = await scheduleSubmission(db, {
		submissionId,
		startsAtMs,
		endsAtMs,
		roomName,
	});

	if (!result.ok) {
		return NextResponse.json(
			{ ok: false, error: result.error },
			{ status: result.status ?? 400 },
		);
	}

	return NextResponse.json({
		ok: true,
		status: result.status,
		slot: result.slot,
		email: result.email,
		broadcasted: result.broadcasted,
		icsPreview: result.icsBytes.slice(0, 200).replace(/\r?\n/g, "\\n"),
		icsBytesLength: result.icsBytes.length,
	});
}
