import { NextResponse } from "next/server";
import { authorizeWritableEventAdminApi } from "@/lib/auth/admin";
import { getDb } from "@/lib/db/cloudflare";
import { removeEventMembership } from "@/lib/db/queries";

type RouteContext = {
	params: Promise<{ eventSlug: string }>;
};

export async function POST(_request: Request, context: RouteContext) {
	const { eventSlug } = await context.params;
	const db = await getDb();
	const authorization = await authorizeWritableEventAdminApi(db, eventSlug);
	if (!authorization.ok) return authorization.response;
	const access = authorization.access;

	if (!access.account || !access.membership) {
		return NextResponse.json(
			{ ok: false, error: "You are not a member of this event" },
			{ status: 400 },
		);
	}

	if (access.membership.role === "owner") {
		return NextResponse.json(
			{
				ok: false,
				error: "Owners must transfer ownership before leaving the team",
			},
			{ status: 400 },
		);
	}

	try {
		const removed = await removeEventMembership(db, {
			eventId: access.event.id,
			accountId: access.account.id,
		});
		if (!removed) {
			return NextResponse.json(
				{ ok: false, error: "Member not found" },
				{ status: 404 },
			);
		}
		return NextResponse.json({ ok: true });
	} catch (error) {
		const message =
			error instanceof Error ? error.message : "Could not leave team";
		return NextResponse.json({ ok: false, error: message }, { status: 400 });
	}
}
