import { NextResponse } from "next/server";
import { ADMIN_BYPASS_COOKIE, isAdminBypassEnabled } from "@/lib/auth/admin";
import { safeNextPath } from "@/lib/security/safe-next-path";

export async function GET(request: Request) {
	if (!(await isAdminBypassEnabled())) {
		return new NextResponse(null, { status: 404 });
	}

	const url = new URL(request.url);
	const next = safeNextPath(url.searchParams.get("next"));
	const response = NextResponse.redirect(new URL(next, url.origin));
	response.cookies.set(ADMIN_BYPASS_COOKIE, "1", {
		httpOnly: true,
		sameSite: "lax",
		path: "/",
		maxAge: 60 * 60 * 24 * 7,
		secure: url.protocol === "https:",
	});
	return response;
}
