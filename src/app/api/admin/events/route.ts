import { NextResponse } from "next/server";
import {
	getCurrentOrganizerAccount,
	isAdminBypass,
} from "@/lib/auth/admin";
import { getDb } from "@/lib/db/cloudflare";
import { getEventBySlug } from "@/lib/db/queries";
import { createEventWithDefaults } from "@/lib/events/create-event";
import { validateEventSettings } from "@/lib/events/settings";

type Body = {
	name?: unknown;
	slug?: unknown;
	timezone?: unknown;
	startDay?: unknown;
	endDay?: unknown;
};

export async function POST(request: Request) {
	const bypass = await isAdminBypass();
	const db = await getDb();
	const account = await getCurrentOrganizerAccount(db);

	if (!bypass && !account) {
		return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
	}

	let body: Body;
	try {
		body = (await request.json()) as Body;
	} catch {
		return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
	}

	const name = typeof body.name === "string" ? body.name.trim() : "";
	const slug = typeof body.slug === "string" ? body.slug.trim().toLowerCase() : "";
	const timezone =
		typeof body.timezone === "string" ? body.timezone.trim() : undefined;
	const startDay = typeof body.startDay === "string" ? body.startDay.trim() : "";
	const endDay = typeof body.endDay === "string" ? body.endDay.trim() : "";

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
		{ name, slug, timezone, startDay, endDay },
		owner,
	);

	return NextResponse.json({ ok: true, slug: created.slug, eventId: created.eventId });
}
