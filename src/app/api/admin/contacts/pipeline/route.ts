import { NextResponse } from "next/server";
import { isJsonObject, readBoundedJson } from "@/lib/cfp/request";
import {
	enrollContactInPipeline,
	getPipelineBoard,
	isContactPipelineStage,
	moveContactPipelineStage,
} from "@/lib/contacts";
import { authorizeContactsApi } from "@/lib/contacts/auth";
import { getDb } from "@/lib/db/cloudflare";

export async function GET() {
	const db = await getDb();
	const auth = await authorizeContactsApi(db);
	if (!auth.ok) return auth.response;
	const board = await getPipelineBoard(db, auth.account.id);
	return NextResponse.json({ ok: true, board });
}

export async function PATCH(request: Request) {
	const db = await getDb();
	const auth = await authorizeContactsApi(db);
	if (!auth.ok) return auth.response;

	const parsed = await readBoundedJson(request, 8 * 1024);
	if (!parsed.ok) return NextResponse.json({ ok: false, error: parsed.error }, { status: parsed.status });
	if (!isJsonObject(parsed.value)) {
		return NextResponse.json({ ok: false, error: "Expected JSON object" }, { status: 400 });
	}

	const contactId = typeof parsed.value.contactId === "string" ? parsed.value.contactId : "";
	const stage = parsed.value.stage;
	const note = typeof parsed.value.note === "string" ? parsed.value.note : null;
	const enroll = parsed.value.enroll === true;
	if (!contactId || !isContactPipelineStage(stage)) {
		return NextResponse.json(
			{ ok: false, error: "contactId and a valid stage are required" },
			{ status: 400 },
		);
	}

	const result = enroll
		? await enrollContactInPipeline(db, {
				accountId: auth.account.id,
				contactId,
				stage,
				note,
				authorAccountId: auth.account.id,
			})
		: await moveContactPipelineStage(db, {
				accountId: auth.account.id,
				contactId,
				toStage: stage,
				note,
				authorAccountId: auth.account.id,
			});

	if (!result.ok) {
		return NextResponse.json({ ok: false, error: result.error }, { status: result.status });
	}
	const board = await getPipelineBoard(db, auth.account.id);
	return NextResponse.json({ ok: true, ...result.value, board });
}
