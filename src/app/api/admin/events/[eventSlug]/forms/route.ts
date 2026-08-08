import { NextResponse } from "next/server";
import { isAdminBypass } from "@/lib/auth/admin";
import { createForm, listFormsForEvent, updateFormMeta } from "@/lib/cfp/form-admin";
import { getDb } from "@/lib/db/cloudflare";
import { getEventBySlug, getFormBySlug } from "@/lib/db/queries";

type RouteContext = {
	params: Promise<{ eventSlug: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
	if (!(await isAdminBypass())) {
		return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
	}

	const { eventSlug } = await context.params;
	const db = await getDb();
	const event = await getEventBySlug(db, eventSlug);
	if (!event) {
		return NextResponse.json({ ok: false, error: "Event not found" }, { status: 404 });
	}

	const forms = await listFormsForEvent(db, event.id);
	return NextResponse.json({
		ok: true,
		forms: forms.map((form) => ({
			id: form.id,
			slug: form.slug,
			title: form.title,
			description: form.description,
			status: form.status,
			opensAt: form.opens_at,
			closesAt: form.closes_at,
			updatedAt: form.updated_at,
		})),
	});
}

type PatchBody = {
	formSlug?: unknown;
	title?: unknown;
	description?: unknown;
	status?: unknown;
	closesAt?: unknown;
};

export async function PATCH(request: Request, context: RouteContext) {
	if (!(await isAdminBypass())) {
		return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
	}

	const { eventSlug } = await context.params;
	const db = await getDb();
	const event = await getEventBySlug(db, eventSlug);
	if (!event) {
		return NextResponse.json({ ok: false, error: "Event not found" }, { status: 404 });
	}

	const body = (await request.json()) as PatchBody;
	const formSlug =
		typeof body.formSlug === "string" ? body.formSlug.trim() : "";
	if (!formSlug) {
		return NextResponse.json(
			{ ok: false, error: "formSlug is required" },
			{ status: 400 },
		);
	}

	const form = await getFormBySlug(db, event.id, formSlug);
	if (!form) {
		return NextResponse.json({ ok: false, error: "Form not found" }, { status: 404 });
	}

	const status =
		body.status === "draft" || body.status === "open" || body.status === "closed"
			? body.status
			: undefined;

	try {
		await updateFormMeta(db, {
			formId: form.id,
			title: typeof body.title === "string" ? body.title : undefined,
			description:
				body.description === null
					? null
					: typeof body.description === "string"
						? body.description
						: undefined,
			status,
			closesAt:
				body.closesAt === null
					? null
					: typeof body.closesAt === "number"
						? body.closesAt
						: undefined,
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

	return NextResponse.json({ ok: true });
}

type PostBody = {
	slug?: unknown;
	title?: unknown;
};

export async function POST(request: Request, context: RouteContext) {
	if (!(await isAdminBypass())) {
		return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
	}

	const { eventSlug } = await context.params;
	const db = await getDb();
	const event = await getEventBySlug(db, eventSlug);
	if (!event) {
		return NextResponse.json({ ok: false, error: "Event not found" }, { status: 404 });
	}

	const body = (await request.json()) as PostBody;
	const slug = typeof body.slug === "string" ? body.slug.trim() : "";
	const title = typeof body.title === "string" ? body.title.trim() : "";
	if (!slug || !title) {
		return NextResponse.json(
			{ ok: false, error: "slug and title are required" },
			{ status: 400 },
		);
	}

	try {
		const form = await createForm(db, { eventId: event.id, slug, title });
		return NextResponse.json({
			ok: true,
			form: {
				id: form.id,
				slug: form.slug,
				title: form.title,
				status: form.status,
			},
		});
	} catch (error) {
		return NextResponse.json(
			{
				ok: false,
				error: error instanceof Error ? error.message : "Create failed",
			},
			{ status: 400 },
		);
	}
}
