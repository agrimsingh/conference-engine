import { NextResponse } from "next/server";
import { isAdminBypass } from "@/lib/auth/admin";
import { getDb } from "@/lib/db/cloudflare";
import { getEventBySlug } from "@/lib/db/queries";
import { loadOutstandingTasksSnapshot } from "@/lib/tasks/outstanding";

type RouteContext = {
	params: Promise<{ eventSlug: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
	if (!(await isAdminBypass())) {
		return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
	}

	const { eventSlug } = await context.params;
	const db = await getDb();
	const event = await getEventBySlug(db, eventSlug);
	if (!event) {
		return NextResponse.json({ ok: false, error: "Event not found" }, { status: 404 });
	}

	const snapshot = await loadOutstandingTasksSnapshot(db, event);
	return NextResponse.json({ ok: true, snapshot });
}
