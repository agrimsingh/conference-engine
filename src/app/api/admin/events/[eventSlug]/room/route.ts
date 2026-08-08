import { NextResponse } from "next/server";
import { authorizeEventAdminApi } from "@/lib/auth/admin";
import { getCloudflareEnv, getDb } from "@/lib/db/cloudflare";

type RouteContext = {
	params: Promise<{ eventSlug: string }>;
};

export async function GET(request: Request, context: RouteContext) {
	const upgrade = request.headers.get("Upgrade");
	if (upgrade?.toLowerCase() !== "websocket") {
		return NextResponse.json(
			{ ok: false, error: "Expected WebSocket upgrade" },
			{ status: 426 },
		);
	}

	const { eventSlug } = await context.params;
	const db = await getDb();
	const access = await authorizeEventAdminApi(db, eventSlug);
	if (!access) {
		return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
	}
	const event = access.event;

	const env = await getCloudflareEnv();
	if (!env.EVENT_ROOM) {
		return NextResponse.json(
			{ ok: false, error: "EVENT_ROOM binding unavailable" },
			{ status: 503 },
		);
	}

	const stub = env.EVENT_ROOM.getByName(event.id);
	return stub.fetch(request);
}
