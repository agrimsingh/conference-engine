import { NextResponse } from "next/server";
import { readBoundedJson } from "@/lib/cfp/request";
import { authorizeEventAdminApi, authorizeWritableEventAdminApi } from "@/lib/auth/admin";
import { getDb } from "@/lib/db/cloudflare";
import {
	addSubmissionLabel,
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
	writable = false,
): Promise<
	| { ok: true; db: D1Database }
	| { ok: false; response: NextResponse }
> {
	const db = await getDb();
	const authorization = writable ? await authorizeWritableEventAdminApi(db, eventSlug) : null;
	if (authorization && !authorization.ok) return { ok: false, response: authorization.response };
	const access = authorization?.access ?? await authorizeEventAdminApi(db, eventSlug);
	if (!access) {
		return {
			ok: false,
			response: NextResponse.json(
				{ ok: false, error: "Unauthorized" },
				{ status: 401 },
			),
		};
	}

	const event = access.event;
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
	const resolved = await resolveSubmission(eventSlug, submissionId, true);
	if (!resolved.ok) return resolved.response;

	const parsed = await readBoundedJson(request, 16 * 1024);
	if (!parsed.ok) return NextResponse.json({ ok: false, error: parsed.error }, { status: parsed.status });
	const raw = parsed.value;

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
	const resolved = await resolveSubmission(eventSlug, submissionId, true);
	if (!resolved.ok) return resolved.response;

	const parsed = await readBoundedJson(request, 16 * 1024);
	if (!parsed.ok) return NextResponse.json({ ok: false, error: parsed.error }, { status: parsed.status });
	const raw = parsed.value;

	const label = normalizeLabel(raw);
	if (!label) {
		return NextResponse.json({ ok: false, error: "Label required" }, { status: 400 });
	}

	await removeSubmissionLabel(resolved.db, submissionId, label);
	return NextResponse.json({ ok: true, label });
}
