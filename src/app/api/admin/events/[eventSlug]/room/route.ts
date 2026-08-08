import { NextResponse } from "next/server";
import { isAdminBypass } from "@/lib/auth/admin";
import { getCloudflareEnv, getDb } from "@/lib/db/cloudflare";
import { getEventBySlug } from "@/lib/db/queries";

type RouteContext = {
	params: Promise<{ eventSlug: string }>;
};

export async function GET(request: Request, context: RouteContext) {
	if (!(await isAdminBypass())) {
		return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
	}

	const upgrade = request.headers.get("Upgrade");
	if (upgrade?.toLowerCase() !== "websocket") {
		return NextResponse.json(
			{ ok: false, error: "Expected WebSocket upgrade" },
			{ status: 426 },
		);
	}

	const { eventSlug } = await context.params;
	const db = await getDb();
	const event = await getEventBySlug(db, eventSlug);
	if (!event) {
		return NextResponse.json({ ok: false, error: "Event not found" }, { status: 404 });
	}

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
