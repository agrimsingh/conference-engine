import { NextResponse } from "next/server";
import { authorizeWritableEventAdminApi } from "@/lib/auth/admin";
import { publishFormRevision } from "@/lib/cfp/form-revisions";
import { getDb } from "@/lib/db/cloudflare";
import { getFormBySlug } from "@/lib/db/queries";

type RouteContext = {
	params: Promise<{ eventSlug: string; formSlug: string }>;
};

export async function POST(_request: Request, context: RouteContext) {
	const { eventSlug, formSlug } = await context.params;
	const db = await getDb();
	const authorization = await authorizeWritableEventAdminApi(db, eventSlug);
	if (!authorization.ok) return authorization.response;
	const form = await getFormBySlug(db, authorization.access.event.id, formSlug);
	if (!form) return NextResponse.json({ ok: false, error: "Form not found" }, { status: 404 });
	const published = await publishFormRevision(db, {
		form,
		accountId: authorization.access.account?.id ?? null,
	});
	return NextResponse.json({
		ok: true,
		revision: published.revision,
		revisionId: published.id,
	});
}
