import { NextResponse } from "next/server";
import { isJsonObject, readBoundedJson } from "@/lib/cfp/request";
import { mergeAccountContacts } from "@/lib/contacts";
import { authorizeContactsApi } from "@/lib/contacts/auth";
import { getDb } from "@/lib/db/cloudflare";

export async function POST(request: Request) {
	const db = await getDb();
	const auth = await authorizeContactsApi(db);
	if (!auth.ok) return auth.response;

	const parsed = await readBoundedJson(request, 8 * 1024);
	if (!parsed.ok) return NextResponse.json({ ok: false, error: parsed.error }, { status: parsed.status });
	if (!isJsonObject(parsed.value)) {
		return NextResponse.json({ ok: false, error: "Expected JSON object" }, { status: 400 });
	}

	const primaryContactId =
		typeof parsed.value.primaryContactId === "string" ? parsed.value.primaryContactId : "";
	const secondaryContactId =
		typeof parsed.value.secondaryContactId === "string" ? parsed.value.secondaryContactId : "";
	if (!primaryContactId || !secondaryContactId) {
		return NextResponse.json(
			{ ok: false, error: "primaryContactId and secondaryContactId are required" },
			{ status: 400 },
		);
	}

	const merged = await mergeAccountContacts(db, {
		accountId: auth.account.id,
		primaryContactId,
		secondaryContactId,
		authorAccountId: auth.account.id,
	});
	if (!merged.ok) {
		return NextResponse.json({ ok: false, error: merged.error }, { status: merged.status });
	}
	return NextResponse.json({ ok: true, contact: merged.value });
}
