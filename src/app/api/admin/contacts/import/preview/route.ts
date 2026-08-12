import { NextResponse } from "next/server";
import { isJsonObject, readBoundedJson } from "@/lib/cfp/request";
import { previewAccountContactsCsv } from "@/lib/contacts";
import { authorizeContactsApi } from "@/lib/contacts/auth";
import { getDb } from "@/lib/db/cloudflare";

export async function POST(request: Request) {
	const db = await getDb();
	const auth = await authorizeContactsApi(db);
	if (!auth.ok) return auth.response;

	const parsed = await readBoundedJson(request, 512 * 1024);
	if (!parsed.ok) {
		return NextResponse.json({ ok: false, error: parsed.error }, { status: parsed.status });
	}
	if (!isJsonObject(parsed.value) || typeof parsed.value.csv !== "string") {
		return NextResponse.json({ ok: false, error: "Expected { csv }" }, { status: 400 });
	}
	if (parsed.value.csv.length > 512 * 1024) {
		return NextResponse.json({ ok: false, error: "CSV is too large" }, { status: 413 });
	}

	const preview = await previewAccountContactsCsv(db, {
		accountId: auth.account.id,
		csv: parsed.value.csv,
	});
	if (!preview.ok) {
		return NextResponse.json(preview, { status: 400 });
	}
	return NextResponse.json(preview);
}
