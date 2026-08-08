import { NextResponse } from "next/server";
import { ADMIN_BYPASS_COOKIE, isAdminBypassEnabled } from "@/lib/auth/admin";

export async function GET(request: Request) {
	if (!(await isAdminBypassEnabled())) {
		return new NextResponse(null, { status: 404 });
	}

	const url = new URL(request.url);
	const next = url.searchParams.get("next") ?? "/admin";
	const response = NextResponse.redirect(new URL(next, url.origin));
	response.cookies.set(ADMIN_BYPASS_COOKIE, "1", {
		httpOnly: true,
		sameSite: "lax",
		path: "/",
		maxAge: 60 * 60 * 24 * 7,
		secure: process.env.NODE_ENV === "production",
	});
	return response;
}
