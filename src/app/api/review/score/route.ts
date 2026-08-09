import { NextResponse } from "next/server";
import { isJsonObject, readBoundedJson } from "@/lib/cfp/request";
import { isAdminBypass } from "@/lib/auth/admin";
import { getDb } from "@/lib/db/cloudflare";
import {
	getActiveEvaluationPlan,
	getEventBySlug,
} from "@/lib/db/queries";
import { upsertEvaluationScore } from "@/lib/evaluation/score";

type Body = {
	token?: unknown;
	eventSlug?: unknown;
	submissionId?: unknown;
	score?: unknown;
	comment?: unknown;
	criterionScores?: unknown;
};

export async function POST(request: Request) {
	const parsed = await readBoundedJson(request, 16 * 1024);
	if (!parsed.ok) return NextResponse.json({ ok: false, error: parsed.error }, { status: parsed.status });
	if (!isJsonObject(parsed.value)) return NextResponse.json({ ok: false, error: "Expected JSON object" }, { status: 400 });
	const body = parsed.value as Body;

	const submissionId =
		typeof body.submissionId === "string" ? body.submissionId : "";
	const score = typeof body.score === "number" ? body.score : Number(body.score);
	const comment = typeof body.comment === "string" ? body.comment : undefined;

	const criterionScores = Array.isArray(body.criterionScores) ? body.criterionScores.map((value) => {
		if (!isJsonObject(value)) return { criterionId: "", score: Number.NaN, comment: undefined };
		return { criterionId: typeof value.criterionId === "string" ? value.criterionId : "", score: typeof value.score === "number" ? value.score : Number(value.score), comment: typeof value.comment === "string" ? value.comment : undefined };
	}) : undefined;
	if (!submissionId || (!Number.isFinite(score) && !criterionScores)) {
		return NextResponse.json(
			{ ok: false, error: "submissionId and score or criterionScores required" },
			{ status: 400 },
		);
	}
	if (criterionScores?.some((value) => !value.criterionId || !Number.isFinite(value.score))) {
		return NextResponse.json({ ok: false, error: "criterionScores must contain criterionId and numeric score" }, { status: 400 });
	}

	const db = await getDb();
	const token = typeof body.token === "string" ? body.token.trim() : "";
	let committeePlanId: string | undefined;

	if (!token && (await isAdminBypass())) {
		const eventSlug =
			typeof body.eventSlug === "string" ? body.eventSlug.trim() : "";
		if (!eventSlug) {
			return NextResponse.json(
				{ ok: false, error: "token or eventSlug required for admin scoring" },
				{ status: 400 },
			);
		}
		const event = await getEventBySlug(db, eventSlug);
		if (!event) {
			return NextResponse.json({ ok: false, error: "Event not found" }, { status: 404 });
		}
		const plan = await getActiveEvaluationPlan(db, event.id);
		if (!plan) {
			return NextResponse.json(
				{ ok: false, error: "No active evaluation plan; activate one first" },
				{ status: 409 },
			);
		}
		committeePlanId = plan.id;
	}

	if (!token && !committeePlanId) {
		return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
	}

	const result = await upsertEvaluationScore(db, {
		token,
		submissionId,
		score: Number.isFinite(score) ? score : undefined,
		comment,
		criterionScores: criterionScores ?? undefined,
		committeePlanId,
	});

	if (!result.ok) {
		return NextResponse.json(
			{ ok: false, error: result.error },
			{ status: result.status },
		);
	}

	return NextResponse.json({ ok: true, score: result.score });
}
