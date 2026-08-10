import { NextResponse } from "next/server";
import { isJsonObject, readBoundedJson } from "@/lib/cfp/request";
import { pushContactToEvent } from "@/lib/contacts";
import { authorizeContactsApi } from "@/lib/contacts/auth";
import { getDb } from "@/lib/db/cloudflare";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
	const { id } = await context.params;
	const db = await getDb();
	const auth = await authorizeContactsApi(db);
	if (!auth.ok) return auth.response;

	const parsed = await readBoundedJson(request, 8 * 1024);
	if (!parsed.ok) return NextResponse.json({ ok: false, error: parsed.error }, { status: parsed.status });
	if (!isJsonObject(parsed.value)) {
		return NextResponse.json({ ok: false, error: "Expected JSON object" }, { status: 400 });
	}

	const eventId = typeof parsed.value.eventId === "string" ? parsed.value.eventId : "";
	if (!eventId) {
		return NextResponse.json({ ok: false, error: "eventId is required" }, { status: 400 });
	}

	const result = await pushContactToEvent(db, {
		accountId: auth.account.id,
		contactId: id,
		eventId,
		authorAccountId: auth.account.id,
	});
	if (!result.ok) {
		return NextResponse.json({ ok: false, error: result.error }, { status: result.status });
	}
	return NextResponse.json({ ok: true, ...result.value });
}
