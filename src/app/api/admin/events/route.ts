import { NextResponse } from "next/server";
import { isJsonObject, readBoundedJson } from "@/lib/cfp/request";
import {
	getCurrentOrganizerAccount,
	isAdminBypass,
} from "@/lib/auth/admin";
import { getDb } from "@/lib/db/cloudflare";
import { getEventBySlug } from "@/lib/db/queries";
import { createEventWithDefaults, isEventCfpPresetId } from "@/lib/events/create-event";
import { validateEventSettings } from "@/lib/events/settings";

type Body = {
	name?: unknown;
	slug?: unknown;
	timezone?: unknown;
	startDay?: unknown;
	endDay?: unknown;
	preset?: unknown;
};

export async function POST(request: Request) {
	const bypass = await isAdminBypass();
	const db = await getDb();
	const account = await getCurrentOrganizerAccount(db);

	if (!bypass && !account) {
		return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
	}

	const parsed = await readBoundedJson(request, 64 * 1024);
	if (!parsed.ok) return NextResponse.json({ ok: false, error: parsed.error }, { status: parsed.status });
	if (!isJsonObject(parsed.value)) return NextResponse.json({ ok: false, error: "Expected JSON object" }, { status: 400 });
	const body = parsed.value as Body;

	const name = typeof body.name === "string" ? body.name.trim() : "";
	const slug = typeof body.slug === "string" ? body.slug.trim().toLowerCase() : "";
	const timezone =
		typeof body.timezone === "string" ? body.timezone.trim() : undefined;
	const startDay = typeof body.startDay === "string" ? body.startDay.trim() : "";
	const endDay = typeof body.endDay === "string" ? body.endDay.trim() : "";
	const preset = body.preset === undefined ? "minimal" : body.preset;
	if (!isEventCfpPresetId(preset)) {
		return NextResponse.json(
			{ ok: false, error: "Preset must be minimal or conference" },
			{ status: 400 },
		);
	}

	if (!name || name.length < 2) {
		return NextResponse.json(
			{ ok: false, error: "Event name required" },
			{ status: 400 },
		);
	}

	if (!slug || !/^[a-z0-9-]+$/.test(slug)) {
		return NextResponse.json(
			{ ok: false, error: "Slug must be lowercase letters, numbers, and hyphens" },
			{ status: 400 },
		);
	}

	const schedule = validateEventSettings({ startDay, endDay, timezone });
	if (!schedule.ok) return NextResponse.json({ ok: false, error: schedule.error }, { status: 400 });

	const existing = await getEventBySlug(db, slug);
	if (existing) {
		return NextResponse.json(
			{ ok: false, error: "An event with that slug already exists" },
			{ status: 409 },
		);
	}

	const owner = account ?? null;
	const created = await createEventWithDefaults(
		db,
		{ name, slug, timezone, startDay, endDay, preset },
		owner,
	);

	return NextResponse.json({ ok: true, slug: created.slug, eventId: created.eventId });
}
