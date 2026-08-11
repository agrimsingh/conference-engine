import { NextResponse } from "next/server";
import {
	createOrganizerSession,
	setOrganizerSessionCookie,
} from "@/lib/auth/organizer-session";
import { consumeAuthChallenge } from "@/lib/auth/challenges";
import { getAuthSecret, getDb } from "@/lib/db/cloudflare";
import { getAccountById } from "@/lib/db/queries";
import { acceptEventInvitation } from "@/lib/events/invite-member";
import { safeNextPath } from "@/lib/security/safe-next-path";

export async function GET(request: Request) {
	const url = new URL(request.url);
	const token = url.searchParams.get("token")?.trim() ?? "";
	const next = safeNextPath(url.searchParams.get("next")?.trim());

	if (!token) {
		return NextResponse.redirect(new URL("/login", url.origin));
	}

	const db = await getDb();
	const secret = await getAuthSecret();
	const organizer = await consumeAuthChallenge(db, { secret, token, kind: "organizer_login" });
	const invitation = organizer ? null : await acceptEventInvitation(db, { secret, token });
	const accountId = organizer?.accountId ?? invitation?.accountId ?? null;
	if (!accountId) {
		const fail = new URL("/login", url.origin);
		fail.searchParams.set("error", "expired");
		return NextResponse.redirect(fail);
	}

	const account = await getAccountById(db, accountId);
	if (!account) {
		const fail = new URL("/login", url.origin);
		fail.searchParams.set("error", "expired");
		return NextResponse.redirect(fail);
	}
	const { token: sessionToken } = await createOrganizerSession({ accountId: account.id, email: account.email });
	await setOrganizerSessionCookie(sessionToken);

	return NextResponse.redirect(new URL(next, url.origin));
}
