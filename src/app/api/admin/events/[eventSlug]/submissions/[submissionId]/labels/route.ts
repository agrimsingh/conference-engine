import { NextResponse } from "next/server";
import { isAdminBypass } from "@/lib/auth/admin";
import { getDb } from "@/lib/db/cloudflare";
import {
	addSubmissionLabel,
	getEventBySlug,
	getSubmissionById,
	removeSubmissionLabel,
} from "@/lib/db/queries";

type RouteContext = {
	params: Promise<{ eventSlug: string; submissionId: string }>;
};

const MAX_LABEL_LENGTH = 40;

function normalizeLabel(raw: unknown): string | null {
	if (typeof raw !== "object" || raw === null) return null;
	const label = (raw as Record<string, unknown>).label;
	if (typeof label !== "string") return null;
	const normalized = label.trim().replace(/\s+/g, " ");
	if (!normalized || normalized.length > MAX_LABEL_LENGTH) return null;
	return normalized;
}

async function resolveSubmission(
	eventSlug: string,
	submissionId: string,
): Promise<
	| { ok: true; db: D1Database }
	| { ok: false; response: NextResponse }
> {
	if (!(await isAdminBypass())) {
		return {
			ok: false,
			response: NextResponse.json(
				{ ok: false, error: "Unauthorized" },
				{ status: 401 },
			),
		};
	}

	const db = await getDb();
	const event = await getEventBySlug(db, eventSlug);
	if (!event) {
		return {
			ok: false,
			response: NextResponse.json(
				{ ok: false, error: "Event not found" },
				{ status: 404 },
			),
		};
	}

	const submission = await getSubmissionById(db, submissionId);
	if (!submission || submission.event_id !== event.id) {
		return {
			ok: false,
			response: NextResponse.json(
				{ ok: false, error: "Submission not found" },
				{ status: 404 },
			),
		};
	}

	return { ok: true, db };
}

export async function POST(request: Request, context: RouteContext) {
	const { eventSlug, submissionId } = await context.params;
	const resolved = await resolveSubmission(eventSlug, submissionId);
	if (!resolved.ok) return resolved.response;

	let raw: unknown;
	try {
		raw = await request.json();
	} catch {
		return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
	}

	const label = normalizeLabel(raw);
	if (!label) {
		return NextResponse.json(
			{ ok: false, error: `Label must be 1–${MAX_LABEL_LENGTH} characters` },
			{ status: 400 },
		);
	}

	await addSubmissionLabel(resolved.db, submissionId, label);
	return NextResponse.json({ ok: true, label });
}

export async function DELETE(request: Request, context: RouteContext) {
	const { eventSlug, submissionId } = await context.params;
	const resolved = await resolveSubmission(eventSlug, submissionId);
	if (!resolved.ok) return resolved.response;

	let raw: unknown;
	try {
		raw = await request.json();
	} catch {
		return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
	}

	const label = normalizeLabel(raw);
	if (!label) {
		return NextResponse.json({ ok: false, error: "Label required" }, { status: 400 });
	}

	await removeSubmissionLabel(resolved.db, submissionId, label);
	return NextResponse.json({ ok: true, label });
}
