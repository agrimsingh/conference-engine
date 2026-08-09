import { NextResponse } from "next/server";
import { authorizeWritableEventAdminApi } from "@/lib/auth/admin";
import { getDb } from "@/lib/db/cloudflare";
import { retryEmailDelivery } from "@/lib/email/resend";

type RouteContext = { params: Promise<{ eventSlug: string; deliveryKey: string }> };

export async function POST(_request: Request, context: RouteContext) {
	const { eventSlug, deliveryKey } = await context.params;
	if (!deliveryKey || deliveryKey.length > 512) return NextResponse.json({ ok: false, error: "Invalid delivery key" }, { status: 400 });
	const db = await getDb();
	const authorization = await authorizeWritableEventAdminApi(db, eventSlug);
	if (!authorization.ok) return authorization.response;
	const result = await retryEmailDelivery(db, { eventId: authorization.access.event.id, deliveryKey });
	if (!result) return NextResponse.json({ ok: false, error: "Delivery envelope not found" }, { status: 404 });
	return result.ok
		? NextResponse.json({ ok: true, delivery: result })
		: NextResponse.json({ ok: false, error: result.error, delivery: result }, { status: 502 });
}
