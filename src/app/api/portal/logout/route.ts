import { NextResponse } from "next/server";
import { clearPortalSession } from "@/lib/speakers/portal-session";

export async function POST(request: Request) {
	await clearPortalSession();
	return NextResponse.redirect(new URL("/portal", request.url), 303);
}
