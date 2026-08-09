import { NextResponse } from "next/server";
import {
	authorizeEventAdminApi,
	authorizeWritableEventAdminApi,
} from "@/lib/auth/admin";
import { isJsonObject, readBoundedJson } from "@/lib/cfp/request";
import { getCloudflareEnv, getDb } from "@/lib/db/cloudflare";
import {
	ACCELEVENTS_SESSION_TYPE_FORMATS,
	deleteAcceleventsIntegration,
	getAcceleventsIntegrationStatus,
	saveAcceleventsIntegration,
	type AcceleventsSessionTypeFormat,
} from "@/lib/integrations/accelevents/repository";

type RouteContext = { params: Promise<{ eventSlug: string }> };

function readString(value: unknown): string | null {
	return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizeEventUrl(value: string): string | null {
	if (/^[a-z0-9-]{1,120}$/i.test(value)) return value;
	try {
		const url = new URL(value);
		if (!/(^|\.)accelevents\.com$/i.test(url.hostname)) return null;
		const match = /^\/events\/([a-z0-9-]{1,120})\/?$/i.exec(url.pathname);
		return match?.[1] ?? null;
	} catch {
		return null;
	}
}

function isSessionTypeFormat(value: unknown): value is AcceleventsSessionTypeFormat {
	return typeof value === "string" && ACCELEVENTS_SESSION_TYPE_FORMATS.some((format) => format === value);
}

export async function GET(_request: Request, context: RouteContext) {
	const { eventSlug } = await context.params;
	const db = await getDb();
	const access = await authorizeEventAdminApi(db, eventSlug);
	if (!access) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
	const integration = await getAcceleventsIntegrationStatus(db, access.event.id);
	return NextResponse.json({ ok: true, integration });
}

export async function POST(request: Request, context: RouteContext) {
	const { eventSlug } = await context.params;
	const db = await getDb();
	const authorization = await authorizeWritableEventAdminApi(db, eventSlug);
	if (!authorization.ok) return authorization.response;
	const parsed = await readBoundedJson(request, 8 * 1024);
	if (!parsed.ok) return NextResponse.json({ ok: false, error: parsed.error }, { status: parsed.status });
	if (!isJsonObject(parsed.value)) return NextResponse.json({ ok: false, error: "Expected a JSON object" }, { status: 400 });
	const eventUrl = readString(parsed.value.eventUrl);
	const apiKey = readString(parsed.value.apiKey);
	const externalEventId = parsed.value.externalEventId;
	const autoSyncEnabled = parsed.value.autoSyncEnabled;
	if (!eventUrl || !isSessionTypeFormat(parsed.value.sessionTypeFormat) || typeof externalEventId !== "number" || !Number.isInteger(externalEventId) || externalEventId <= 0) {
		return NextResponse.json({ ok: false, error: "eventUrl, externalEventId, and sessionTypeFormat are required" }, { status: 400 });
	}
	if (autoSyncEnabled !== undefined && typeof autoSyncEnabled !== "boolean") {
		return NextResponse.json({ ok: false, error: "autoSyncEnabled must be a boolean" }, { status: 400 });
	}
	if (!apiKey && !(await getAcceleventsIntegrationStatus(db, authorization.access.event.id)).configured) {
		return NextResponse.json({ ok: false, error: "An API key is required to connect Accelevents" }, { status: 400 });
	}
	const normalizedEventUrl = normalizeEventUrl(eventUrl);
	if (!normalizedEventUrl) return NextResponse.json({ ok: false, error: "Use an Accelevents event slug or https://www.accelevents.com/events/{slug}" }, { status: 400 });
	const env = await getCloudflareEnv();
	if (!env.AUTH_SECRET) return NextResponse.json({ ok: false, error: "AUTH_SECRET is required to store Accelevents credentials" }, { status: 503 });
	try {
		const integration = await saveAcceleventsIntegration(db, {
			eventId: authorization.access.event.id,
			eventUrl: normalizedEventUrl,
			externalEventId,
			sessionTypeFormat: parsed.value.sessionTypeFormat,
			apiKey: apiKey ?? undefined,
			secret: env.AUTH_SECRET,
			autoSyncEnabled,
		});
		return NextResponse.json({ ok: true, integration });
	} catch (error) {
		if (error instanceof Error && /UNIQUE constraint failed: accelevents_integrations\.event_url/i.test(error.message)) {
			return NextResponse.json({ ok: false, error: "This Accelevents event is already connected to another event" }, { status: 409 });
		}
		throw error;
	}
}

export async function DELETE(_request: Request, context: RouteContext) {
	const { eventSlug } = await context.params;
	const db = await getDb();
	const authorization = await authorizeWritableEventAdminApi(db, eventSlug);
	if (!authorization.ok) return authorization.response;
	await deleteAcceleventsIntegration(db, authorization.access.event.id);
	return NextResponse.json({ ok: true });
}
