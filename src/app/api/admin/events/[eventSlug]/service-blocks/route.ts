import { NextResponse } from "next/server";
import { authorizeWritableEventAdminApi } from "@/lib/auth/admin";
import { readBoundedJson, isJsonObject } from "@/lib/cfp/request";
import { getDb } from "@/lib/db/cloudflare";
import { broadcastEventInvalidate } from "@/lib/realtime/event-room";
import {
	createServiceBlock,
	deleteServiceBlock,
	isAgendaVisibility,
	type ServiceBlockInput,
} from "@/lib/sessions/service-blocks";

type RouteContext = { params: Promise<{ eventSlug: string }> };

function parseCreateBody(raw: unknown): ServiceBlockInput | null {
	if (!isJsonObject(raw)) return null;
	if (typeof raw.title !== "string") return null;
	if (typeof raw.durationMinutes !== "number") return null;
	if (!isAgendaVisibility(raw.agendaVisibility)) return null;
	return {
		title: raw.title,
		abstract: typeof raw.abstract === "string" ? raw.abstract : null,
		durationMinutes: raw.durationMinutes,
		agendaVisibility: raw.agendaVisibility,
	};
}

export async function POST(request: Request, context: RouteContext) {
	const { eventSlug } = await context.params;
	const db = await getDb();
	const authorization = await authorizeWritableEventAdminApi(db, eventSlug);
	if (!authorization.ok) return authorization.response;
	const json = await readBoundedJson(request, 32 * 1024);
	if (!json.ok) return NextResponse.json({ ok: false, error: json.error }, { status: json.status });
	const body = parseCreateBody(json.value);
	if (!body) {
		return NextResponse.json(
			{ ok: false, error: "Expected { title, durationMinutes, agendaVisibility: public|private, abstract? }" },
			{ status: 400 },
		);
	}
	try {
		const created = await createServiceBlock(db, { eventId: authorization.access.event.id, input: body });
		const broadcasted = await broadcastEventInvalidate(authorization.access.event.id, "service-blocks.create");
		return NextResponse.json({
			ok: true,
			submissionId: created.id,
			title: created.input.title,
			durationMinutes: created.input.durationMinutes,
			agendaVisibility: created.input.agendaVisibility,
			broadcasted,
		});
	} catch (error) {
		return NextResponse.json(
			{ ok: false, error: error instanceof Error ? error.message : "Could not create service block" },
			{ status: 400 },
		);
	}
}

export async function DELETE(request: Request, context: RouteContext) {
	const { eventSlug } = await context.params;
	const db = await getDb();
	const authorization = await authorizeWritableEventAdminApi(db, eventSlug);
	if (!authorization.ok) return authorization.response;
	const json = await readBoundedJson(request, 8 * 1024);
	if (!json.ok) return NextResponse.json({ ok: false, error: json.error }, { status: json.status });
	if (!isJsonObject(json.value) || typeof json.value.submissionId !== "string") {
		return NextResponse.json({ ok: false, error: "Expected { submissionId }" }, { status: 400 });
	}
	const result = await deleteServiceBlock(db, {
		eventId: authorization.access.event.id,
		submissionId: json.value.submissionId,
	});
	if (!result.ok) return NextResponse.json({ ok: false, error: result.error }, { status: result.status });
	const broadcasted = await broadcastEventInvalidate(authorization.access.event.id, "service-blocks.delete");
	return NextResponse.json({ ok: true, broadcasted });
}
