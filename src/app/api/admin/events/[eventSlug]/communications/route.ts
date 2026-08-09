import { NextResponse } from "next/server";
import { authorizeEventAdminApi, authorizeWritableEventAdminApi } from "@/lib/auth/admin";
import { isJsonObject, readBoundedJson } from "@/lib/cfp/request";
import { getDb } from "@/lib/db/cloudflare";
import { listEventDeliveryHistory, listReminderRecipients } from "@/lib/email/communications";
import {
	isEditableMessageTemplateKey,
	listEventMessageTemplates,
	upsertEventMessageTemplate,
} from "@/lib/email/templates";

type RouteContext = { params: Promise<{ eventSlug: string }> };
const MAX_COMMUNICATIONS_BYTES = 64 * 1024;

export async function GET(_request: Request, context: RouteContext) {
	const { eventSlug } = await context.params;
	const db = await getDb();
	const access = await authorizeEventAdminApi(db, eventSlug);
	if (!access) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
	const [templates, deliveries, reminders] = await Promise.all([
		listEventMessageTemplates(db, access.event.id),
		listEventDeliveryHistory(db, access.event.id),
		listReminderRecipients(db, access.event.id),
	]);
	return NextResponse.json({ ok: true, templates, deliveries, reminders });
}

export async function PUT(request: Request, context: RouteContext) {
	const { eventSlug } = await context.params;
	const db = await getDb();
	const authorization = await authorizeWritableEventAdminApi(db, eventSlug);
	if (!authorization.ok) return authorization.response;
	const parsed = await readBoundedJson(request, MAX_COMMUNICATIONS_BYTES);
	if (!parsed.ok || !isJsonObject(parsed.value)) {
		return NextResponse.json({ ok: false, error: parsed.ok ? "Expected JSON object" : parsed.error }, { status: parsed.ok ? 400 : parsed.status });
	}
	const { templateKey, subject, text } = parsed.value;
	if (typeof templateKey !== "string" || !isEditableMessageTemplateKey(templateKey) || typeof subject !== "string" || typeof text !== "string") {
		return NextResponse.json({ ok: false, error: "Expected an editable templateKey, subject, and text" }, { status: 400 });
	}
	try {
		const template = await upsertEventMessageTemplate(db, {
			eventId: authorization.access.event.id,
			templateKey,
			subject,
			text,
		});
		return NextResponse.json({ ok: true, template });
	} catch (error) {
		return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Could not save template" }, { status: 400 });
	}
}
