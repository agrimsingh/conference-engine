import { NextResponse } from "next/server";
import { isAdminBypass } from "@/lib/auth/admin";
import {
	insertFormField,
	reorderFormFields,
	rowToFieldDef,
	softDeleteFormField,
	updateFormField,
	validateFieldWrite,
} from "@/lib/cfp/form-admin";
import { getDb } from "@/lib/db/cloudflare";
import { getEventBySlug, getFormBySlug, listFormFields } from "@/lib/db/queries";

type RouteContext = {
	params: Promise<{ eventSlug: string; formSlug: string }>;
};

async function loadForm(eventSlug: string, formSlug: string) {
	const db = await getDb();
	const event = await getEventBySlug(db, eventSlug);
	if (!event) return { error: NextResponse.json({ ok: false, error: "Event not found" }, { status: 404 }) };
	const form = await getFormBySlug(db, event.id, formSlug);
	if (!form) return { error: NextResponse.json({ ok: false, error: "Form not found" }, { status: 404 }) };
	return { db, event, form };
}

export async function GET(_request: Request, context: RouteContext) {
	if (!(await isAdminBypass())) {
		return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
	}
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
	if (!(await isAdminBypass())) {
		return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
	}
	const { eventSlug, formSlug } = await context.params;
	const loaded = await loadForm(eventSlug, formSlug);
	if ("error" in loaded) return loaded.error;

	const body: unknown = await request.json();
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
	if (!(await isAdminBypass())) {
		return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
	}
	const { eventSlug, formSlug } = await context.params;
	const loaded = await loadForm(eventSlug, formSlug);
	if ("error" in loaded) return loaded.error;

	const body = (await request.json()) as {
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
		await reorderFormFields(loaded.db, loaded.form.id, body.orderedIds);
		return NextResponse.json({ ok: true });
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
		const row = await updateFormField(loaded.db, fieldId, validated);
		return NextResponse.json({
			ok: true,
			field: { id: row.id, ...rowToFieldDef(row) },
		});
	} catch (error) {
		return NextResponse.json(
			{
				ok: false,
				error: error instanceof Error ? error.message : "Update failed",
			},
			{ status: 400 },
		);
	}
}

export async function DELETE(request: Request, context: RouteContext) {
	if (!(await isAdminBypass())) {
		return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
	}
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
		await softDeleteFormField(loaded.db, fieldId);
		return NextResponse.json({ ok: true });
	} catch (error) {
		return NextResponse.json(
			{
				ok: false,
				error: error instanceof Error ? error.message : "Delete failed",
			},
			{ status: 400 },
		);
	}
}
