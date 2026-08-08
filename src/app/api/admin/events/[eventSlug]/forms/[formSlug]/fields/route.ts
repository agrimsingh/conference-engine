import { NextResponse } from "next/server";
import { isJsonObject, readBoundedJson } from "@/lib/cfp/request";
import { authorizeEventAdminApi } from "@/lib/auth/admin";
import {
	insertFormField,
	reorderFormFields,
	rowToFieldDef,
	softDeleteFormField,
	updateFormField,
	validateFieldWrite,
} from "@/lib/cfp/form-admin";
import { getDb } from "@/lib/db/cloudflare";
import { getFormBySlug, listFormFields } from "@/lib/db/queries";

type RouteContext = {
	params: Promise<{ eventSlug: string; formSlug: string }>;
};

async function loadForm(eventSlug: string, formSlug: string) {
	const db = await getDb();
	const access = await authorizeEventAdminApi(db, eventSlug);
	if (!access) {
		return {
			error: NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 }),
		};
	}
	const form = await getFormBySlug(db, access.event.id, formSlug);
	if (!form) {
		return { error: NextResponse.json({ ok: false, error: "Form not found" }, { status: 404 }) };
	}
	return { db, event: access.event, form };
}

export async function GET(_request: Request, context: RouteContext) {
	const { eventSlug, formSlug } = await context.params;
	const loaded = await loadForm(eventSlug, formSlug);
	if ("error" in loaded) return loaded.error;

	const rows = await listFormFields(loaded.db, loaded.form.id);
	return NextResponse.json({
		ok: true,
		form: {
			id: loaded.form.id,
			slug: loaded.form.slug,
			title: loaded.form.title,
			status: loaded.form.status,
		},
		fields: rows.map((row) => ({
			id: row.id,
			...rowToFieldDef(row),
		})),
	});
}

export async function POST(request: Request, context: RouteContext) {
	const { eventSlug, formSlug } = await context.params;
	const loaded = await loadForm(eventSlug, formSlug);
	if ("error" in loaded) return loaded.error;

	const parsed = await readBoundedJson(request, 64 * 1024);
	if (!parsed.ok) return NextResponse.json({ ok: false, error: parsed.error }, { status: parsed.status });
	if (!isJsonObject(parsed.value)) return NextResponse.json({ ok: false, error: "Expected JSON object" }, { status: 400 });
	const body: unknown = parsed.value;
	const validated = validateFieldWrite(body);
	if (typeof validated === "string") {
		return NextResponse.json({ ok: false, error: validated }, { status: 400 });
	}

	try {
		const row = await insertFormField(loaded.db, loaded.form.id, validated);
		return NextResponse.json({
			ok: true,
			field: { id: row.id, ...rowToFieldDef(row) },
		});
	} catch (error) {
		return NextResponse.json(
			{
				ok: false,
				error: error instanceof Error ? error.message : "Insert failed",
			},
			{ status: 400 },
		);
	}
}

export async function PATCH(request: Request, context: RouteContext) {
	const { eventSlug, formSlug } = await context.params;
	const loaded = await loadForm(eventSlug, formSlug);
	if ("error" in loaded) return loaded.error;

	const parsed = await readBoundedJson(request, 64 * 1024);
	if (!parsed.ok) return NextResponse.json({ ok: false, error: parsed.error }, { status: parsed.status });
	if (!isJsonObject(parsed.value)) return NextResponse.json({ ok: false, error: "Expected JSON object" }, { status: 400 });
	const body = parsed.value as {
		action?: unknown;
		fieldId?: unknown;
		orderedIds?: unknown;
		field?: unknown;
	};

	if (body.action === "reorder") {
		if (
			!Array.isArray(body.orderedIds) ||
			!body.orderedIds.every((id) => typeof id === "string")
		) {
			return NextResponse.json(
				{ ok: false, error: "orderedIds must be string[]" },
				{ status: 400 },
			);
		}
		try {
			await reorderFormFields(loaded.db, loaded.form.id, body.orderedIds);
			return NextResponse.json({ ok: true });
		} catch (error) {
			return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Reorder failed" }, { status: 400 });
		}
	}

	const fieldId = typeof body.fieldId === "string" ? body.fieldId : "";
	if (!fieldId) {
		return NextResponse.json(
			{ ok: false, error: "fieldId is required" },
			{ status: 400 },
		);
	}
	const validated = validateFieldWrite(body.field);
	if (typeof validated === "string") {
		return NextResponse.json({ ok: false, error: validated }, { status: 400 });
	}

	try {
		const row = await updateFormField(loaded.db, loaded.form.id, fieldId, validated);
		return NextResponse.json({
			ok: true,
			field: { id: row.id, ...rowToFieldDef(row) },
		});
	} catch (error) {
		const message = error instanceof Error ? error.message : "Update failed";
		return NextResponse.json(
			{
				ok: false,
				error: message,
			},
			{ status: message === "Field not found" ? 404 : 400 },
		);
	}
}

export async function DELETE(request: Request, context: RouteContext) {
	const { eventSlug, formSlug } = await context.params;
	const loaded = await loadForm(eventSlug, formSlug);
	if ("error" in loaded) return loaded.error;

	const url = new URL(request.url);
	const fieldId = url.searchParams.get("fieldId")?.trim() || "";
	if (!fieldId) {
		return NextResponse.json(
			{ ok: false, error: "fieldId query param required" },
			{ status: 400 },
		);
	}

	try {
		await softDeleteFormField(loaded.db, loaded.form.id, fieldId);
		return NextResponse.json({ ok: true });
	} catch (error) {
		const message = error instanceof Error ? error.message : "Delete failed";
		return NextResponse.json(
			{
				ok: false,
				error: message,
			},
			{ status: message === "Field not found" ? 404 : 400 },
		);
	}
}
