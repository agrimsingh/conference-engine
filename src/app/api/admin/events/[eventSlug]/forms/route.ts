import { NextResponse } from "next/server";
import { isJsonObject, readBoundedJson } from "@/lib/cfp/request";
import { authorizeEventAdminApi } from "@/lib/auth/admin";
import { createForm, listFormsForEvent, updateFormMeta } from "@/lib/cfp/form-admin";
import { getDb } from "@/lib/db/cloudflare";
import { getFormBySlug } from "@/lib/db/queries";

type RouteContext = {
	params: Promise<{ eventSlug: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
	const { eventSlug } = await context.params;
	const db = await getDb();
	const access = await authorizeEventAdminApi(db, eventSlug);
	if (!access) {
		return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
	}

	const forms = await listFormsForEvent(db, access.event.id);
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
	minSpeakers?: unknown;
	maxSpeakers?: unknown;
	draftsEnabled?: unknown;
	submissionLimit?: unknown;
	welcomeCopy?: unknown;
	confirmationCopy?: unknown;
	reminderCopy?: unknown;
};

export async function PATCH(request: Request, context: RouteContext) {
	const { eventSlug } = await context.params;
	const db = await getDb();
	const access = await authorizeEventAdminApi(db, eventSlug);
	if (!access) {
		return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
	}

	const parsed = await readBoundedJson(request, 64 * 1024);
	if (!parsed.ok) return NextResponse.json({ ok: false, error: parsed.error }, { status: parsed.status });
	if (!isJsonObject(parsed.value)) return NextResponse.json({ ok: false, error: "Expected JSON object" }, { status: 400 });
	const body = parsed.value as PatchBody;
	const formSlug =
		typeof body.formSlug === "string" ? body.formSlug.trim() : "";
	if (!formSlug) {
		return NextResponse.json(
			{ ok: false, error: "formSlug is required" },
			{ status: 400 },
		);
	}

	const form = await getFormBySlug(db, access.event.id, formSlug);
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
			minSpeakers:
				typeof body.minSpeakers === "number" ? body.minSpeakers : undefined,
			maxSpeakers:
				typeof body.maxSpeakers === "number" ? body.maxSpeakers : undefined,
			draftsEnabled:
				typeof body.draftsEnabled === "boolean" ? body.draftsEnabled : undefined,
			submissionLimit:
				typeof body.submissionLimit === "number" ? body.submissionLimit : undefined,
			welcomeCopy:
				body.welcomeCopy === null
					? null
					: typeof body.welcomeCopy === "string"
						? body.welcomeCopy
						: undefined,
			confirmationCopy:
				body.confirmationCopy === null
					? null
					: typeof body.confirmationCopy === "string"
						? body.confirmationCopy
						: undefined,
			reminderCopy:
				body.reminderCopy === null
					? null
					: typeof body.reminderCopy === "string"
						? body.reminderCopy
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
	const { eventSlug } = await context.params;
	const db = await getDb();
	const access = await authorizeEventAdminApi(db, eventSlug);
	if (!access) {
		return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
	}

	const parsed = await readBoundedJson(request, 16 * 1024);
	if (!parsed.ok) return NextResponse.json({ ok: false, error: parsed.error }, { status: parsed.status });
	if (!isJsonObject(parsed.value)) return NextResponse.json({ ok: false, error: "Expected JSON object" }, { status: 400 });
	const body = parsed.value as PostBody;
	const slug = typeof body.slug === "string" ? body.slug.trim() : "";
	const title = typeof body.title === "string" ? body.title.trim() : "";
	if (!slug || !title) {
		return NextResponse.json(
			{ ok: false, error: "slug and title are required" },
			{ status: 400 },
		);
	}

	try {
		const form = await createForm(db, {
			eventId: access.event.id,
			slug,
			title,
		});
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
