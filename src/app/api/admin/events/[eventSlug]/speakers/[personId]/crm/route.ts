import { NextResponse } from "next/server";
import { authorizeEventAdminApi, authorizeWritableEventAdminApi } from "@/lib/auth/admin";
import { isJsonObject, readBoundedJson } from "@/lib/cfp/request";
import { getDb } from "@/lib/db/cloudflare";
import {
	getSpeakerCrmDetail,
	normalizeSpeakerCrmTags,
	updateSpeakerCrm,
	type SpeakerCrmUpdateInput,
} from "@/lib/speakers/crm";
import { listEventSpeakerRoster } from "@/lib/speakers/roster";

type RouteContext = {
	params: Promise<{ eventSlug: string; personId: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
	const { eventSlug, personId } = await context.params;
	const db = await getDb();
	const access = await authorizeEventAdminApi(db, eventSlug);
	if (!access) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
	if (!(await speakerExistsInRoster(db, access.event.id, personId))) {
		return NextResponse.json({ ok: false, error: "Speaker not found" }, { status: 404 });
	}
	return NextResponse.json({ ok: true, crm: await getSpeakerCrmDetail(db, access.event.id, personId) });
}

export async function PATCH(request: Request, context: RouteContext) {
	const { eventSlug, personId } = await context.params;
	const db = await getDb();
	const authorization = await authorizeWritableEventAdminApi(db, eventSlug);
	if (!authorization.ok) return authorization.response;
	if (!(await speakerExistsInRoster(db, authorization.access.event.id, personId))) {
		return NextResponse.json({ ok: false, error: "Speaker not found" }, { status: 404 });
	}

	const parsed = await readBoundedJson(request, 16 * 1024);
	if (!parsed.ok) return NextResponse.json({ ok: false, error: parsed.error }, { status: parsed.status });
	if (!isJsonObject(parsed.value)) return NextResponse.json({ ok: false, error: "Expected JSON object" }, { status: 400 });

	const owner = parseOwner(parsed.value.ownerAccountId);
	if (!owner.ok) return NextResponse.json({ ok: false, error: owner.error }, { status: 400 });
	const tags = parsed.value.tags === undefined ? undefined : normalizeSpeakerCrmTags(parsed.value.tags);
	if (tags && !tags.ok) return NextResponse.json({ ok: false, error: tags.error }, { status: 400 });
	const note = parseActivity(parsed.value.note, "Internal notes");
	if (!note.ok) return NextResponse.json({ ok: false, error: note.error }, { status: 400 });
	const contactNote = parseActivity(parsed.value.contactNote, "Contact notes");
	if (!contactNote.ok) return NextResponse.json({ ok: false, error: contactNote.error }, { status: 400 });
	if (owner.value === undefined && tags === undefined && note.value === undefined && contactNote.value === undefined) {
		return NextResponse.json({ ok: false, error: "Provide an owner, tags, note, or contact" }, { status: 400 });
	}
	if ((note.value !== undefined || contactNote.value !== undefined) && !authorization.access.account) {
		return NextResponse.json({ ok: false, error: "Organizer account required to add CRM activity" }, { status: 401 });
	}

	const crmInput: SpeakerCrmUpdateInput = {
		eventId: authorization.access.event.id,
		personId,
		authorAccountId: authorization.access.account?.id ?? null,
		now: Date.now(),
		...(owner.value === undefined ? {} : { ownerAccountId: owner.value }),
		...(tags === undefined ? {} : { tags: tags.tags }),
		...(note.value === undefined ? {} : { note: note.value }),
		...(contactNote.value === undefined ? {} : { contactNote: contactNote.value }),
	};
	const result = await updateSpeakerCrm(db, crmInput);
	return result.ok
		? NextResponse.json({ ok: true, crm: result.detail })
		: NextResponse.json({ ok: false, error: result.error }, { status: result.status });
}

async function speakerExistsInRoster(db: D1Database, eventId: string, personId: string): Promise<boolean> {
	return (await listEventSpeakerRoster(db, eventId)).some((speaker) => speaker.personId === personId);
}

function parseOwner(value: unknown): { ok: true; value: string | null | undefined } | { ok: false; error: string } {
	if (value === undefined) return { ok: true, value: undefined };
	if (value === null) return { ok: true, value: null };
	if (typeof value === "string" && value.trim()) return { ok: true, value: value.trim() };
	return { ok: false, error: "Owner must be an organizer account or empty" };
}

function parseActivity(value: unknown, label: string): { ok: true; value: string | undefined } | { ok: false; error: string } {
	if (value === undefined) return { ok: true, value: undefined };
	if (typeof value !== "string") return { ok: false, error: `${label} must be text` };
	const body = value.trim();
	if (!body || body.length > 4_000) return { ok: false, error: `${label} must contain 1 to 4000 characters` };
	return { ok: true, value: body };
}
