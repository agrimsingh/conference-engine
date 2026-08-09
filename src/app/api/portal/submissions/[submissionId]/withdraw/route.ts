import { NextResponse } from "next/server";
import { getDb } from "@/lib/db/cloudflare";
import { readPortalSessionFromCookie } from "@/lib/speakers/portal-session";
import { withdrawSubmission } from "@/lib/speakers/withdraw";

type RouteContext = { params: Promise<{ submissionId: string }> };

export async function POST(_request: Request, context: RouteContext) {
	const session = await readPortalSessionFromCookie();
	if (!session) {
		return NextResponse.json({ ok: false, error: "Invalid or expired token" }, { status: 401 });
	}
	const { submissionId } = await context.params;
	const result = await withdrawSubmission(await getDb(), {
		submissionId,
		personId: session.personId,
	});
	return result.ok
		? NextResponse.json(result)
		: NextResponse.json(result, { status: result.status });
}
