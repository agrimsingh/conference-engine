import { clearOrganizerSession } from "@/lib/auth/organizer-session";
import { safeNextPath } from "@/lib/security/safe-next-path";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
	await clearOrganizerSession();
	const url = new URL(request.url);
	const next = safeNextPath(url.searchParams.get("next"), "/login");
	return NextResponse.redirect(new URL(next, url.origin), 303);
}
