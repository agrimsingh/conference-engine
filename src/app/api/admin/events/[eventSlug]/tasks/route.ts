import { NextResponse } from "next/server";
import { authorizeWritableEventAdminApi } from "@/lib/auth/admin";
import { isJsonObject, readBoundedJson } from "@/lib/cfp/request";
import { createFileRequestForAllSpeakers } from "@/lib/content/deliverables";
import { getDb } from "@/lib/db/cloudflare";

export async function POST(request: Request, context: { params: Promise<{ eventSlug: string }> }) {
	const { eventSlug } = await context.params;
	const db = await getDb();
	const auth = await authorizeWritableEventAdminApi(db, eventSlug);
	if (!auth.ok) return auth.response;
	const parsed = await readBoundedJson(request, 16 * 1024);
	if (!parsed.ok || !isJsonObject(parsed.value)) return NextResponse.json({ ok: false, error: parsed.ok ? "Expected JSON object" : parsed.error }, { status: parsed.ok ? 400 : parsed.status });
	const dueAt = typeof parsed.value.dueDate === "string" ? Date.parse(`${parsed.value.dueDate}T23:59:59.999Z`) : Number.NaN;
	try {
		const result = await createFileRequestForAllSpeakers(db, {
			eventId: auth.access.event.id,
			label: typeof parsed.value.label === "string" ? parsed.value.label : "",
			instructions: typeof parsed.value.instructions === "string" ? parsed.value.instructions : "",
			dueAt,
		});
		return NextResponse.json({ ok: true, ...result });
	} catch (error) {
		return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Could not create task" }, { status: 400 });
	}
}
