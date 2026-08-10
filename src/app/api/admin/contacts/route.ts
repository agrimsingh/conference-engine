import { NextResponse } from "next/server";
import { isJsonObject, readBoundedJson } from "@/lib/cfp/request";
import {
	createAccountContact,
	getContactKpis,
	isContactPipelineStage,
	listAccountContacts,
	listFilterOptions,
} from "@/lib/contacts";
import { authorizeContactsApi } from "@/lib/contacts/auth";
import { getDb } from "@/lib/db/cloudflare";

export async function GET(request: Request) {
	const db = await getDb();
	const auth = await authorizeContactsApi(db);
	if (!auth.ok) return auth.response;

	const url = new URL(request.url);
	const filters = {
		q: url.searchParams.get("q") ?? undefined,
		company: url.searchParams.get("company") ?? undefined,
		title: url.searchParams.get("title") ?? undefined,
		tag: url.searchParams.get("tag") ?? undefined,
		stage: (() => {
			const raw = url.searchParams.get("stage");
			if (!raw || raw === "all") return "all" as const;
			return isContactPipelineStage(raw) ? raw : undefined;
		})(),
	};
	if (filters.stage === undefined) {
		return NextResponse.json({ ok: false, error: "Invalid stage filter" }, { status: 400 });
	}

	const [contacts, options, kpis] = await Promise.all([
		listAccountContacts(db, auth.account.id, filters),
		listFilterOptions(db, auth.account.id),
		getContactKpis(db, auth.account.id),
	]);

	return NextResponse.json({ ok: true, contacts, options, kpis });
}

export async function POST(request: Request) {
	const db = await getDb();
	const auth = await authorizeContactsApi(db);
	if (!auth.ok) return auth.response;

	const parsed = await readBoundedJson(request, 32 * 1024);
	if (!parsed.ok) return NextResponse.json({ ok: false, error: parsed.error }, { status: parsed.status });
	if (!isJsonObject(parsed.value)) {
		return NextResponse.json({ ok: false, error: "Expected JSON object" }, { status: 400 });
	}

	const email = typeof parsed.value.email === "string" ? parsed.value.email : "";
	const name = typeof parsed.value.name === "string" ? parsed.value.name : "";
	const title = typeof parsed.value.title === "string" ? parsed.value.title : null;
	const company = typeof parsed.value.company === "string" ? parsed.value.company : null;
	const bio = typeof parsed.value.bio === "string" ? parsed.value.bio : null;
	const notes = typeof parsed.value.notes === "string" ? parsed.value.notes : null;
	const tags = Array.isArray(parsed.value.tags) ? parsed.value.tags : undefined;
	const customFields =
		parsed.value.customFields &&
		typeof parsed.value.customFields === "object" &&
		!Array.isArray(parsed.value.customFields)
			? Object.fromEntries(
					Object.entries(parsed.value.customFields as Record<string, unknown>).flatMap(
						([key, value]) => (typeof value === "string" ? [[key, value] as const] : []),
					),
				)
			: undefined;

	const created = await createAccountContact(db, {
		accountId: auth.account.id,
		authorAccountId: auth.account.id,
		input: { email, name, title, company, bio, notes, tags, customFields },
	});
	if (!created.ok) {
		return NextResponse.json({ ok: false, error: created.error }, { status: created.status });
	}
	return NextResponse.json({ ok: true, contact: created.value });
}
