import { NextResponse } from "next/server";
import { authorizeEventAdminApi } from "@/lib/auth/admin";
import { isJsonObject, readBoundedJson } from "@/lib/cfp/request";
import { exportLatestDeliverables } from "@/lib/content/export";
import { getDb, getFilesBucket } from "@/lib/db/cloudflare";

export async function POST(request: Request, context: { params: Promise<{ eventSlug: string }> }) {
	const { eventSlug } = await context.params;
	const db = await getDb();
	const auth = await authorizeEventAdminApi(db, eventSlug);
	if (!auth) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
	const parsed = await readBoundedJson(request, 16 * 1024);
	if (!parsed.ok || !isJsonObject(parsed.value) || !Array.isArray(parsed.value.taskIds) || parsed.value.taskIds.some((id) => typeof id !== "string")) return NextResponse.json({ ok: false, error: parsed.ok ? "taskIds must be a string array" : parsed.error }, { status: parsed.ok ? 400 : parsed.status });
	const result = await exportLatestDeliverables(db, await getFilesBucket(), { eventId: auth.event.id, taskIds: parsed.value.taskIds });
	if (!result.ok) return NextResponse.json({ ok: false, error: result.error }, { status: result.status });
	const body = new Uint8Array(result.body.byteLength); body.set(result.body);
	return new Response(body.buffer, { headers: { "Content-Type": "application/zip", "Content-Disposition": `attachment; filename="${eventSlug}-latest-deliverables.zip"`, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "X-Deliverable-Count": String(result.count) } });
}
