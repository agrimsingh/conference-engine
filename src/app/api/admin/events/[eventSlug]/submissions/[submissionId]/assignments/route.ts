import { NextResponse } from "next/server";
import { isJsonObject, readBoundedJson } from "@/lib/cfp/request";
import { authorizeEventAdminApi } from "@/lib/auth/admin";
import { getDb } from "@/lib/db/cloudflare";
import {
	getActiveEvaluationPlan,
	getSubmissionById,
	listReviewersForPlan,
} from "@/lib/db/queries";
import {
	AssignmentValidationError,
	assignedReviewerIds,
	listAssignments,
	setSubmissionReviewers,
} from "@/lib/evaluation/assignments";

type RouteContext = {
	params: Promise<{ eventSlug: string; submissionId: string }>;
};

type Body = {
	reviewerIds?: unknown;
};

async function resolveContext(eventSlug: string, submissionId: string) {
	const db = await getDb();
	const access = await authorizeEventAdminApi(db, eventSlug);
	if (!access) {
		return {
			ok: false as const,
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
			ok: false as const,
			response: NextResponse.json(
				{ ok: false, error: "Submission not found" },
				{ status: 404 },
			),
		};
	}

	const plan = await getActiveEvaluationPlan(db, event.id);
	if (!plan) {
		return {
			ok: false as const,
			response: NextResponse.json(
				{ ok: false, error: "No active evaluation plan; activate one first" },
				{ status: 409 },
			),
		};
	}

	return { ok: true as const, db, plan, submission };
}

export async function GET(_request: Request, context: RouteContext) {
	const { eventSlug, submissionId } = await context.params;
	const resolved = await resolveContext(eventSlug, submissionId);
	if (!resolved.ok) return resolved.response;

	const { db, plan } = resolved;
	const [assignments, reviewers] = await Promise.all([
		listAssignments(db, { planId: plan.id, submissionId }),
		listReviewersForPlan(db, plan.id),
	]);
	const byId = new Map(reviewers.map((row) => [row.id, row]));

	return NextResponse.json({
		ok: true,
		planId: plan.id,
		reviewerIds: assignedReviewerIds(assignments),
		assignments: assignments.map((row) => ({
			id: row.id,
			reviewerId: row.reviewer_id,
			submissionId: row.submission_id,
			createdAt: row.created_at,
			reviewerName: byId.get(row.reviewer_id)?.name ?? null,
		})),
		reviewers: reviewers.map((row) => ({
			id: row.id,
			name: row.name,
		})),
	});
}

export async function PUT(request: Request, context: RouteContext) {
	const { eventSlug, submissionId } = await context.params;
	const resolved = await resolveContext(eventSlug, submissionId);
	if (!resolved.ok) return resolved.response;

	const parsed = await readBoundedJson(request, 16 * 1024);
	if (!parsed.ok) return NextResponse.json({ ok: false, error: parsed.error }, { status: parsed.status });
	if (!isJsonObject(parsed.value)) return NextResponse.json({ ok: false, error: "Expected JSON object" }, { status: 400 });
	const body = parsed.value as Body;

	if (!Array.isArray(body.reviewerIds)) {
		return NextResponse.json(
			{ ok: false, error: "reviewerIds must be an array of strings" },
			{ status: 400 },
		);
	}

	const reviewerIds: string[] = [];
	for (const value of body.reviewerIds) {
		if (typeof value !== "string" || !value.trim()) {
			return NextResponse.json(
				{ ok: false, error: "reviewerIds must be an array of strings" },
				{ status: 400 },
			);
		}
		reviewerIds.push(value);
	}

	try {
		const assignments = await setSubmissionReviewers(resolved.db, {
			planId: resolved.plan.id,
			submissionId,
			reviewerIds,
		});
		return NextResponse.json({
			ok: true,
			planId: resolved.plan.id,
			reviewerIds: assignedReviewerIds(assignments),
		});
	} catch (error) {
		if (error instanceof AssignmentValidationError) {
			return NextResponse.json(
				{ ok: false, error: error.message },
				{ status: 400 },
			);
		}
		throw error;
	}
}
