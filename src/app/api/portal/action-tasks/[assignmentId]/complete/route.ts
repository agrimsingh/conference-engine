import { NextResponse } from "next/server";
import { getDb } from "@/lib/db/cloudflare";
import { broadcastEventInvalidate } from "@/lib/realtime/event-room";
import { completeSpeakerActionAssignment } from "@/lib/speakers/operations";
import { readPortalSessionFromCookie } from "@/lib/speakers/portal-session";

export async function POST(_request: Request, context: { params: Promise<{ assignmentId: string }> }) {
	const session = await readPortalSessionFromCookie();
	if (!session) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
	const { assignmentId } = await context.params;
	const result = await completeSpeakerActionAssignment(await getDb(), { assignmentId, personId: session.personId });
	if (!result.ok) return NextResponse.json(result, { status: result.status });
	await broadcastEventInvalidate(result.eventId, "speaker.action-task.completed");
	return NextResponse.json({ ok: true });
}
