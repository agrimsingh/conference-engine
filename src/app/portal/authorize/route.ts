import { NextResponse } from "next/server";
import { consumeAuthChallenge } from "@/lib/auth/challenges";
import { getAuthSecret, getDb } from "@/lib/db/cloudflare";
import {
	createPortalSession,
	setPortalSessionCookie,
} from "@/lib/speakers/portal-session";

export async function GET(request: Request) {
	const url = new URL(request.url);
	const token = url.searchParams.get("token")?.trim() ?? "";
	const db = await getDb();
	const challenge = await consumeAuthChallenge(db, {
		secret: await getAuthSecret(),
		token,
		kind: "portal_login",
	});
	if (!challenge?.personId) {
		const fail = new URL("/portal", url.origin);
		fail.searchParams.set("error", "expired");
		return NextResponse.redirect(fail);
	}
	const person = await db.prepare("SELECT id, email FROM people WHERE id = ?").bind(challenge.personId).first<{ id: string; email: string }>();
	if (!person) {
		const fail = new URL("/portal", url.origin);
		fail.searchParams.set("error", "expired");
		return NextResponse.redirect(fail);
	}
	const { token: sessionToken } = await createPortalSession({ email: person.email, personId: person.id });
	await setPortalSessionCookie(sessionToken);
	return NextResponse.redirect(new URL("/portal", url.origin));
}
