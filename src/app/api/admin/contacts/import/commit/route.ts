import { NextResponse } from "next/server";
import { isJsonObject, readBoundedJson } from "@/lib/cfp/request";
import { commitAccountContactsCsv } from "@/lib/contacts";
import { authorizeContactsApi } from "@/lib/contacts/auth";
import { getDb } from "@/lib/db/cloudflare";

export async function POST(request: Request) {
	const db = await getDb();
	const auth = await authorizeContactsApi(db);
	if (!auth.ok) return auth.response;

	const contentType = request.headers.get("content-type") ?? "";
	let csv = "";
	if (contentType.includes("text/csv") || contentType.includes("application/csv")) {
		csv = await request.text();
	} else {
		const parsed = await readBoundedJson(request, 512 * 1024);
		if (!parsed.ok) {
			return NextResponse.json({ ok: false, error: parsed.error }, { status: parsed.status });
		}
		if (!isJsonObject(parsed.value) || typeof parsed.value.csv !== "string") {
			return NextResponse.json({ ok: false, error: "Expected { csv }" }, { status: 400 });
		}
		csv = parsed.value.csv;
	}

	if (csv.length > 512 * 1024) {
		return NextResponse.json({ ok: false, error: "CSV is too large" }, { status: 413 });
	}

	const imported = await commitAccountContactsCsv(db, {
		accountId: auth.account.id,
		authorAccountId: auth.account.id,
		csv,
	});
	if (!imported.ok) {
		return NextResponse.json(imported, { status: 400 });
	}
	return NextResponse.json(imported);
}
