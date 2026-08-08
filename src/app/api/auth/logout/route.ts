import { clearOrganizerSession } from "@/lib/auth/organizer-session";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
	await clearOrganizerSession();
	const url = new URL(request.url);
	const next = url.searchParams.get("next") ?? "/login";
	return NextResponse.redirect(new URL(next, url.origin));
}
