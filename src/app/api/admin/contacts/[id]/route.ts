import { NextResponse } from "next/server";
import { isJsonObject, readBoundedJson } from "@/lib/cfp/request";
import { findDuplicateContactsByName, getAccountContact, updateAccountContact } from "@/lib/contacts";
import { authorizeContactsApi } from "@/lib/contacts/auth";
import { getDb } from "@/lib/db/cloudflare";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
	const { id } = await context.params;
	const db = await getDb();
	const auth = await authorizeContactsApi(db);
	if (!auth.ok) return auth.response;

	const contact = await getAccountContact(db, auth.account.id, id);
	if (!contact) {
		return NextResponse.json({ ok: false, error: "Contact not found" }, { status: 404 });
	}
	const duplicates = (await findDuplicateContactsByName(db, auth.account.id, contact.name)).filter(
		(row) => row.id !== contact.id,
	);
	return NextResponse.json({ ok: true, contact, duplicates });
}

export async function PATCH(request: Request, context: RouteContext) {
	const { id } = await context.params;
	const db = await getDb();
	const auth = await authorizeContactsApi(db);
	if (!auth.ok) return auth.response;

	const parsed = await readBoundedJson(request, 32 * 1024);
	if (!parsed.ok) return NextResponse.json({ ok: false, error: parsed.error }, { status: parsed.status });
	if (!isJsonObject(parsed.value)) {
		return NextResponse.json({ ok: false, error: "Expected JSON object" }, { status: 400 });
	}

	const input: Parameters<typeof updateAccountContact>[1]["input"] = {};
	if (typeof parsed.value.email === "string") input.email = parsed.value.email;
	if (typeof parsed.value.name === "string") input.name = parsed.value.name;
	if (typeof parsed.value.title === "string" || parsed.value.title === null) {
		input.title = parsed.value.title as string | null;
	}
	if (typeof parsed.value.company === "string" || parsed.value.company === null) {
		input.company = parsed.value.company as string | null;
	}
	if (typeof parsed.value.bio === "string" || parsed.value.bio === null) {
		input.bio = parsed.value.bio as string | null;
	}
	if (typeof parsed.value.notes === "string" || parsed.value.notes === null) {
		input.notes = parsed.value.notes as string | null;
	}
	if (typeof parsed.value.note === "string") input.note = parsed.value.note;
	if (Array.isArray(parsed.value.tags)) input.tags = parsed.value.tags;
	if (
		parsed.value.customFields &&
		typeof parsed.value.customFields === "object" &&
		!Array.isArray(parsed.value.customFields)
	) {
		input.customFields = Object.fromEntries(
			Object.entries(parsed.value.customFields as Record<string, unknown>).flatMap(([key, value]) =>
				typeof value === "string" ? [[key, value] as const] : [],
			),
		);
	}

	const updated = await updateAccountContact(db, {
		accountId: auth.account.id,
		contactId: id,
		authorAccountId: auth.account.id,
		input,
	});
	if (!updated.ok) {
		return NextResponse.json({ ok: false, error: updated.error }, { status: updated.status });
	}
	return NextResponse.json({ ok: true, contact: updated.value });
}
