import { NextResponse } from "next/server";
import { authorizeWritableEventAdminApi } from "@/lib/auth/admin";
import { createAuthChallenge } from "@/lib/auth/challenges";
import { getAuthSecret, getDb } from "@/lib/db/cloudflare";
import { sendTemplatedEmail } from "@/lib/email/resend";
import { listEventSpeakerRoster } from "@/lib/speakers/roster";

export async function POST(request: Request, context: { params: Promise<{ eventSlug: string; personId: string }> }) {
	const { eventSlug, personId } = await context.params; const db = await getDb(); const auth = await authorizeWritableEventAdminApi(db, eventSlug);
	if (!auth.ok) return auth.response;
	const speaker = (await listEventSpeakerRoster(db, auth.access.event.id)).find((row) => row.personId === personId);
	if (!speaker) return NextResponse.json({ ok: false, error: "Speaker not found" }, { status: 404 });
	const challenge = await createAuthChallenge(db, { secret: await getAuthSecret(), kind: "portal_login", personId, eventId: auth.access.event.id });
	const url = new URL("/portal/authorize", request.url); url.searchParams.set("token", challenge.token);
	const delivery = await sendTemplatedEmail(db, { eventId: auth.access.event.id, submissionId: null, templateKey: "portal_magic_link", toEmail: speaker.email, context: { eventName: auth.access.event.name, submitterName: speaker.name, title: "Speaker portal", portalUrl: url.toString() }, force: true });
	if (!delivery.ok) return NextResponse.json({ ok: false, error: delivery.error ?? "Invite delivery failed" }, { status: 503 });
	return NextResponse.json({ ok: true, status: delivery.status });
}
