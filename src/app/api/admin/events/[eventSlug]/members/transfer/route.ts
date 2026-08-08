import { NextResponse } from "next/server";
import {
	authorizeEventAdminApi,
	isAdminBypass,
} from "@/lib/auth/admin";
import { getDb } from "@/lib/db/cloudflare";
import { transferEventOwnership } from "@/lib/db/queries";

type RouteContext = {
	params: Promise<{ eventSlug: string }>;
};

export async function POST(request: Request, context: RouteContext) {
	const { eventSlug } = await context.params;
	const db = await getDb();
	const access = await authorizeEventAdminApi(db, eventSlug);
	if (!access) {
		return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
	}

	const bypass = await isAdminBypass();
	if (access.membership?.role !== "owner" && !bypass) {
		return NextResponse.json(
			{ ok: false, error: "Only the event owner can transfer ownership" },
			{ status: 403 },
		);
	}

	let body: { accountId?: unknown };
	try {
		body = (await request.json()) as { accountId?: unknown };
	} catch {
		return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
	}

	const accountId =
		typeof body.accountId === "string" ? body.accountId.trim() : "";
	if (!accountId) {
		return NextResponse.json(
			{ ok: false, error: "accountId required" },
			{ status: 400 },
		);
	}

	try {
		const membership = await transferEventOwnership(db, {
			eventId: access.event.id,
			toAccountId: accountId,
		});
		return NextResponse.json({
			ok: true,
			member: {
				accountId: membership.account_id,
				role: membership.role,
			},
		});
	} catch (error) {
		const message =
			error instanceof Error ? error.message : "Could not transfer ownership";
		return NextResponse.json({ ok: false, error: message }, { status: 400 });
	}
}
