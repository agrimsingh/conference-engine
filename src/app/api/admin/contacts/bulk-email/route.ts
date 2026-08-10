import { NextResponse } from "next/server";
import { isJsonObject, readBoundedJson } from "@/lib/cfp/request";
import { sendBulkContactEmail } from "@/lib/contacts";
import { authorizeContactsApi } from "@/lib/contacts/auth";
import { getAuthSecret, getCloudflareEnv, getDb } from "@/lib/db/cloudflare";

export async function POST(request: Request) {
	const db = await getDb();
	const auth = await authorizeContactsApi(db);
	if (!auth.ok) return auth.response;

	const parsed = await readBoundedJson(request, 64 * 1024);
	if (!parsed.ok) return NextResponse.json({ ok: false, error: parsed.error }, { status: parsed.status });
	if (!isJsonObject(parsed.value)) {
		return NextResponse.json({ ok: false, error: "Expected JSON object" }, { status: 400 });
	}

	const eventId = typeof parsed.value.eventId === "string" ? parsed.value.eventId : "";
	const subject = typeof parsed.value.subject === "string" ? parsed.value.subject : "";
	const text = typeof parsed.value.text === "string" ? parsed.value.text : "";
	const contactIds = Array.isArray(parsed.value.contactIds)
		? parsed.value.contactIds.filter((id): id is string => typeof id === "string")
		: [];

	const env = await getCloudflareEnv();
	const result = await sendBulkContactEmail(db, {
		accountId: auth.account.id,
		authorAccountId: auth.account.id,
		contactIds,
		eventId,
		subject,
		text,
		runtime: {
			authSecret: await getAuthSecret(),
			resendApiKey: env.RESEND_API_KEY,
			resendFromEmail: env.RESEND_FROM_EMAIL,
		},
	});
	if (!result.ok) {
		return NextResponse.json({ ok: false, error: result.error }, { status: result.status });
	}
	return NextResponse.json({ ok: true, ...result.value });
}
