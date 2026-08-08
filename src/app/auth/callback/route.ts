import { NextResponse } from "next/server";
import {
	consumeOrganizerLoginToken,
	createOrganizerSession,
	setOrganizerSessionCookie,
} from "@/lib/auth/organizer-session";

export async function GET(request: Request) {
	const url = new URL(request.url);
	const token = url.searchParams.get("token")?.trim() ?? "";
	const nextParam = url.searchParams.get("next")?.trim() ?? "";
	const next =
		nextParam.startsWith("/") && !nextParam.startsWith("//") ? nextParam : "/admin";

	if (!token) {
		return NextResponse.redirect(new URL("/login", url.origin));
	}

	const login = await consumeOrganizerLoginToken(token);
	if (!login) {
		const fail = new URL("/login", url.origin);
		fail.searchParams.set("error", "expired");
		return NextResponse.redirect(fail);
	}

	const { token: sessionToken } = await createOrganizerSession({
		accountId: login.accountId,
		email: login.email,
	});
	await setOrganizerSessionCookie(sessionToken);

	return NextResponse.redirect(new URL(next, url.origin));
}
