import { NextResponse } from "next/server";
import { isAdminBypass } from "@/lib/auth/admin";
import { getDb } from "@/lib/db/cloudflare";
import { getEventBySlug, getSubmissionById } from "@/lib/db/queries";
import {
	isDecisionAction,
	type DecisionAction,
	type DecisionEmailChoice,
} from "@/lib/domain";
import { broadcastEventInvalidate } from "@/lib/realtime/event-room";
import { decideSubmission } from "@/lib/speakers/decide";

type RouteContext = {
	params: Promise<{ eventSlug: string; submissionId: string }>;
};

type ParsedBody = {
	action: DecisionAction;
	email: DecisionEmailChoice;
};

function parseBody(raw: unknown): ParsedBody | null {
	if (typeof raw !== "object" || raw === null) return null;
	const body = raw as Record<string, unknown>;

	if (typeof body.action !== "string" || !isDecisionAction(body.action)) {
		return null;
	}

	const email = body.email;
	if (typeof email !== "object" || email === null) return null;
	const emailBody = email as Record<string, unknown>;
	if (typeof emailBody.send !== "boolean") return null;

	if (!emailBody.send) {
		return { action: body.action, email: { send: false } };
	}

	const subject =
		typeof emailBody.subject === "string" ? emailBody.subject.trim() : "";
	const text = typeof emailBody.text === "string" ? emailBody.text.trim() : "";
	if (!subject || !text) return null;

	return { action: body.action, email: { send: true, subject, text } };
}

export async function POST(request: Request, context: RouteContext) {
	if (!(await isAdminBypass())) {
		return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
	}

	let raw: unknown;
	try {
		raw = await request.json();
	} catch {
		return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
	}

	const parsed = parseBody(raw);
	if (!parsed) {
		return NextResponse.json(
			{
				ok: false,
				error:
					"Expected { action: accept|waitlist|reject, email: { send, subject?, text? } }",
			},
			{ status: 400 },
		);
	}

	const { eventSlug, submissionId } = await context.params;
	const db = await getDb();
	const event = await getEventBySlug(db, eventSlug);
	if (!event) {
		return NextResponse.json({ ok: false, error: "Event not found" }, { status: 404 });
	}

	const submission = await getSubmissionById(db, submissionId);
	if (!submission || submission.event_id !== event.id) {
		return NextResponse.json(
			{ ok: false, error: "Submission not found" },
			{ status: 404 },
		);
	}

	const result = await decideSubmission(db, submissionId, parsed.action, parsed.email);
	if (!result.ok) {
		return NextResponse.json(
			{ ok: false, error: result.error },
			{ status: result.status ?? 400 },
		);
	}

	const broadcasted = await broadcastEventInvalidate(event.id, "tasks.decide");
	return NextResponse.json({ ...result, broadcasted });
}
