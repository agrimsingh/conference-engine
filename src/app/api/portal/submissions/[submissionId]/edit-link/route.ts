import { NextResponse } from "next/server";
import { recoverPortalSubmissionEditAccess } from "@/lib/cfp/portal-edit-access";
import { getAuthSecret, getDb } from "@/lib/db/cloudflare";
import { readPortalSessionFromCookie } from "@/lib/speakers/portal-session";

type RouteContext = { params: Promise<{ submissionId: string }> };

export async function POST(request: Request, context: RouteContext) {
	const session = await readPortalSessionFromCookie();
	if (!session) {
		return NextResponse.json({ ok: false, error: "Invalid or expired token" }, { status: 401 });
	}
	const { submissionId } = await context.params;
	const access = await recoverPortalSubmissionEditAccess(await getDb(), {
		secret: await getAuthSecret(),
		submissionId,
		personId: session.personId,
	});
	switch (access.kind) {
		case "not_found":
			return NextResponse.json({ ok: false, error: "Submission not found" }, { status: 404 });
		case "not_editable":
			return NextResponse.json({ ok: false, error: "This proposal is no longer editable" }, { status: 409 });
		case "demo":
			return NextResponse.json({ ok: false, error: "Demo events are read-only" }, { status: 403 });
		case "ok": {
			const editUrl = new URL(`/e/${encodeURIComponent(access.eventSlug)}/submit/${encodeURIComponent(access.formSlug)}`, request.url);
			editUrl.searchParams.set("draft", access.token);
			return NextResponse.json({ ok: true, editUrl: editUrl.toString() });
		}
	}
}
