import { NextResponse } from "next/server";
import { isJsonObject, readBoundedJson } from "@/lib/cfp/request";
import {
	createContactSegment,
	getSegmentMembers,
	isContactPipelineStage,
	listContactSegments,
	type ContactFilters,
} from "@/lib/contacts";
import { authorizeContactsApi } from "@/lib/contacts/auth";
import { getDb } from "@/lib/db/cloudflare";

export async function GET(request: Request) {
	const db = await getDb();
	const auth = await authorizeContactsApi(db);
	if (!auth.ok) return auth.response;

	const url = new URL(request.url);
	const segmentId = url.searchParams.get("id");
	if (segmentId) {
		const members = await getSegmentMembers(db, auth.account.id, segmentId);
		if (!members.ok) {
			return NextResponse.json({ ok: false, error: members.error }, { status: members.status });
		}
		return NextResponse.json({ ok: true, ...members.value });
	}

	const segments = await listContactSegments(db, auth.account.id);
	return NextResponse.json({ ok: true, segments });
}

export async function POST(request: Request) {
	const db = await getDb();
	const auth = await authorizeContactsApi(db);
	if (!auth.ok) return auth.response;

	const parsed = await readBoundedJson(request, 8 * 1024);
	if (!parsed.ok) return NextResponse.json({ ok: false, error: parsed.error }, { status: parsed.status });
	if (!isJsonObject(parsed.value)) {
		return NextResponse.json({ ok: false, error: "Expected JSON object" }, { status: 400 });
	}

	const name = typeof parsed.value.name === "string" ? parsed.value.name : "";
	const rawFilters =
		parsed.value.filters && typeof parsed.value.filters === "object" && !Array.isArray(parsed.value.filters)
			? (parsed.value.filters as Record<string, unknown>)
			: {};
	const filters: ContactFilters = {};
	if (typeof rawFilters.q === "string") filters.q = rawFilters.q;
	if (typeof rawFilters.company === "string") filters.company = rawFilters.company;
	if (typeof rawFilters.title === "string") filters.title = rawFilters.title;
	if (typeof rawFilters.tag === "string") filters.tag = rawFilters.tag;
	if (rawFilters.stage === "all" || isContactPipelineStage(rawFilters.stage)) {
		filters.stage = rawFilters.stage;
	}

	const created = await createContactSegment(db, {
		accountId: auth.account.id,
		name,
		filters,
	});
	if (!created.ok) {
		return NextResponse.json({ ok: false, error: created.error }, { status: created.status });
	}
	return NextResponse.json({ ok: true, segment: created.value });
}
