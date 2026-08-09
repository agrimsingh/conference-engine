import { NextResponse } from "next/server";
import { authorizeWritableEventAdminApi } from "@/lib/auth/admin";
import { isJsonObject, readBoundedJson } from "@/lib/cfp/request";
import { getDb } from "@/lib/db/cloudflare";
import { createSpeakerActionTask, uniqueRecipientIds } from "@/lib/speakers/operations";

export async function POST(request: Request, context: { params: Promise<{ eventSlug: string }> }) {
	const { eventSlug } = await context.params; const db = await getDb(); const auth = await authorizeWritableEventAdminApi(db, eventSlug);
	if (!auth.ok) return auth.response;
	const parsed = await readBoundedJson(request, 24 * 1024);
	if (!parsed.ok || !isJsonObject(parsed.value)) return NextResponse.json({ ok: false, error: parsed.ok ? "Expected JSON object" : parsed.error }, { status: parsed.ok ? 400 : parsed.status });
	const personIds = uniqueRecipientIds(parsed.value.personIds);
	if (!personIds) return NextResponse.json({ ok: false, error: "Choose 1 to 100 speakers" }, { status: 400 });
	const dueAt = typeof parsed.value.dueDate === "string" && parsed.value.dueDate ? Date.parse(`${parsed.value.dueDate}T23:59:59.999Z`) : null;
	try {
		const result = await createSpeakerActionTask(db, { eventId: auth.access.event.id, title: typeof parsed.value.title === "string" ? parsed.value.title : "", instructions: typeof parsed.value.instructions === "string" ? parsed.value.instructions : "", dueAt, personIds });
		return NextResponse.json({ ok: true, ...result });
	} catch (error) { return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Could not create task" }, { status: 400 }); }
}
