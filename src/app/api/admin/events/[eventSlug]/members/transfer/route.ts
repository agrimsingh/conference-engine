import { NextResponse } from "next/server";
import { isJsonObject, readBoundedJson } from "@/lib/cfp/request";
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

	const parsed = await readBoundedJson(request, 16 * 1024);
	if (!parsed.ok) return NextResponse.json({ ok: false, error: parsed.error }, { status: parsed.status });
	if (!isJsonObject(parsed.value)) return NextResponse.json({ ok: false, error: "Expected JSON object" }, { status: 400 });
	const body = parsed.value as { accountId?: unknown };

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
