import { NextResponse } from "next/server";
import { authorizeWritableEventAdminApi } from "@/lib/auth/admin";
import { isJsonObject, readBoundedJson } from "@/lib/cfp/request";
import { getCloudflareEnv, getDb } from "@/lib/db/cloudflare";
import { broadcastEventInvalidate } from "@/lib/realtime/event-room";
import { notifyDecidedSubmissions } from "@/lib/speakers/notify-decided";
import { absoluteAppUrl } from "@/lib/email/templates";

type Context = { params: Promise<{ eventSlug: string }> };

export async function POST(request: Request, context: Context) {
	const { eventSlug } = await context.params;
	const db = await getDb();
	const authorization = await authorizeWritableEventAdminApi(db, eventSlug);
	if (!authorization.ok) return authorization.response;

	const parsed = await readBoundedJson(request, 64 * 1024);
	if (!parsed.ok) {
		return NextResponse.json({ ok: false, error: parsed.error }, { status: parsed.status });
	}
	if (!isJsonObject(parsed.value) || !Array.isArray(parsed.value.submissionIds)) {
		return NextResponse.json(
			{ ok: false, error: "Expected submissionIds and email { send: true, subject, text }" },
			{ status: 400 },
		);
	}
	if (parsed.value.submissionIds.some((id) => typeof id !== "string")) {
		return NextResponse.json({ ok: false, error: "submissionIds must be strings" }, { status: 400 });
	}

	const emailRaw = parsed.value.email;
	if (typeof emailRaw !== "object" || emailRaw === null) {
		return NextResponse.json({ ok: false, error: "email is required" }, { status: 400 });
	}
	const email = emailRaw as Record<string, unknown>;
	if (email.send !== true) {
		return NextResponse.json(
			{ ok: false, error: "Bulk notify requires email.send = true" },
			{ status: 400 },
		);
	}
	const subject = typeof email.subject === "string" ? email.subject.trim() : "";
	const text = typeof email.text === "string" ? email.text.trim() : "";
	if (!subject || !text) {
		return NextResponse.json(
			{ ok: false, error: "email.subject and email.text are required" },
			{ status: 400 },
		);
	}

	const result = await notifyDecidedSubmissions(db, {
		eventId: authorization.access.event.id,
		submissionIds: parsed.value.submissionIds,
		email: {
			send: true,
			subject,
			text,
			portalUrl: absoluteAppUrl((await getCloudflareEnv()).APP_ORIGIN, "/portal"),
		},
	});
	const broadcasted =
		result.succeeded > 0
			? await broadcastEventInvalidate(authorization.access.event.id, "tasks.decide")
			: false;
	return NextResponse.json(
		{
			ok: result.failed === 0,
			partial: result.succeeded > 0 && result.failed > 0,
			...(result.failed
				? {
						error: `${result.failed} selected submission${result.failed === 1 ? "" : "s"} could not be notified; see outcomes.`,
					}
				: {}),
			...result,
			broadcasted,
		},
		{ status: result.failed === 0 ? 200 : 207 },
	);
}
