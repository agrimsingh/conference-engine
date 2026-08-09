import { NextResponse } from "next/server";
import { isJsonObject, readBoundedJson } from "@/lib/cfp/request";
import { getDb } from "@/lib/db/cloudflare";
import { recuseAssignment } from "@/lib/evaluation/recusal";
import { resolveReviewIdentity } from "@/lib/evaluation/score";

export async function POST(request: Request) {
	const parsed = await readBoundedJson(request, 16 * 1024);
	if (!parsed.ok || !isJsonObject(parsed.value)) {
		return NextResponse.json(
			{ ok: false, error: parsed.ok ? "Expected JSON object" : parsed.error },
			{ status: parsed.ok ? 400 : parsed.status },
		);
	}

	const token = typeof parsed.value.token === "string" ? parsed.value.token.trim() : "";
	const submissionId =
		typeof parsed.value.submissionId === "string" ? parsed.value.submissionId.trim() : "";
	if (!token || !submissionId) {
		return NextResponse.json({ ok: false, error: "token and submissionId are required" }, { status: 400 });
	}

	const db = await getDb();
	const identity = await resolveReviewIdentity(db, token);
	if (!identity || identity.mode !== "reviewer") {
		return NextResponse.json({ ok: false, error: "Invalid reviewer token" }, { status: 401 });
	}

	const result = await recuseAssignment(db, {
		planId: identity.plan.id,
		reviewerId: identity.reviewer.id,
		submissionId,
	});
	if (!result.ok) {
		const status = result.error === "not_found" ? 404 : 409;
		const error =
			result.error === "not_found" ? "Assignment not found" : "Already recused";
		return NextResponse.json({ ok: false, error }, { status });
	}

	return NextResponse.json({ ok: true, recusedAt: result.assignment.recused_at });
}
