import { NextResponse } from "next/server";
import { getCurrentOrganizerAccount } from "@/lib/auth/admin";
import { getDb } from "@/lib/db/cloudflare";
import {
	claimOrphanEventOwnership,
	getEventBySlug,
	getEventMembership,
} from "@/lib/db/queries";
import { DemoEventWriteError, assertEventWritable } from "@/lib/events/writability";

type RouteContext = {
	params: Promise<{ eventSlug: string }>;
};

/**
 * First logged-in account claims an event that has zero memberships.
 * Used for seeded demo events (e.g. aie-sandbox) that predate accounts.
 */
export async function POST(_request: Request, context: RouteContext) {
	const { eventSlug } = await context.params;
	const db = await getDb();
	const account = await getCurrentOrganizerAccount(db);
	if (!account) {
		return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
	}

	const event = await getEventBySlug(db, eventSlug);
	if (!event) {
		return NextResponse.json({ ok: false, error: "Event not found" }, { status: 404 });
	}
	try {
		assertEventWritable(event);
	} catch (error) {
		if (error instanceof DemoEventWriteError) {
			return NextResponse.json({ ok: false, error: "This demo event is read-only" }, { status: 403 });
		}
		throw error;
	}

	const existing = await getEventMembership(db, event.id, account.id);
	if (existing) {
		return NextResponse.json({
			ok: true,
			slug: event.slug,
			role: existing.role,
			alreadyMember: true,
		});
	}

	const membership = await claimOrphanEventOwnership(db, {
		eventId: event.id,
		accountId: account.id,
	});
	if (!membership) {
		return NextResponse.json(
			{ ok: false, error: "Event already has an owner" },
			{ status: 409 },
		);
	}

	return NextResponse.json({
		ok: true,
		slug: event.slug,
		role: membership.role,
		alreadyMember: false,
	});
}
