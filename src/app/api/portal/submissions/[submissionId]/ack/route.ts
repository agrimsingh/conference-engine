import { NextResponse } from "next/server";
import { getDb } from "@/lib/db/cloudflare";
import { acknowledgeAgendaSlotForActor } from "@/lib/schedule/slot-ack";
import { readPortalSessionFromCookie } from "@/lib/speakers/portal-session";

type RouteContext = { params: Promise<{ submissionId: string }> };

export async function POST(_request: Request, context: RouteContext) {
	const session = await readPortalSessionFromCookie();
	if (!session) {
		return NextResponse.json({ ok: false, error: "Invalid or expired token" }, { status: 401 });
	}
	const { submissionId } = await context.params;
	const result = await acknowledgeAgendaSlotForActor(await getDb(), {
		submissionId,
		actorPersonId: session.personId,
	});
	return result.ok
		? NextResponse.json(result)
		: NextResponse.json(result, { status: result.status });
}
