import { NextResponse } from "next/server";
import {
	authorizeEventAdminApi,
	isAdminBypass,
	shouldExposeDevLoginUrl,
} from "@/lib/auth/admin";
import { getDb } from "@/lib/db/cloudflare";
import {
	listEventMembers,
	removeEventMembership,
} from "@/lib/db/queries";
import {
	inviteOrganizerToEvent,
	type InviteRole,
} from "@/lib/events/invite-member";

type RouteContext = {
	params: Promise<{ eventSlug: string }>;
};

function parseInviteRole(raw: unknown): InviteRole | null {
	if (raw === undefined || raw === null) return "admin";
	if (raw === "admin" || raw === "owner") return raw;
	return null;
}

export async function GET(_request: Request, context: RouteContext) {
	const { eventSlug } = await context.params;
	const db = await getDb();
	const access = await authorizeEventAdminApi(db, eventSlug);
	if (!access) {
		return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
	}

	const members = await listEventMembers(db, access.event.id);
	return NextResponse.json({
		ok: true,
		members: members.map((member) => ({
			accountId: member.account_id,
			email: member.email,
			name: member.name,
			role: member.role,
			createdAt: member.created_at,
		})),
	});
}

export async function POST(request: Request, context: RouteContext) {
	const { eventSlug } = await context.params;
	const db = await getDb();
	const access = await authorizeEventAdminApi(db, eventSlug);
	if (!access) {
		return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
	}

	let body: { email?: unknown; name?: unknown; role?: unknown };
	try {
		body = (await request.json()) as {
			email?: unknown;
			name?: unknown;
			role?: unknown;
		};
	} catch {
		return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
	}

	const email = typeof body.email === "string" ? body.email : "";
	const name = typeof body.name === "string" ? body.name : undefined;
	const role = parseInviteRole(body.role);
	if (!role) {
		return NextResponse.json(
			{ ok: false, error: "role must be admin or owner" },
			{ status: 400 },
		);
	}

	const bypass = await isAdminBypass();
	if (role === "owner" && access.membership?.role !== "owner" && !bypass) {
		return NextResponse.json(
			{ ok: false, error: "Only the event owner can invite as owner" },
			{ status: 403 },
		);
	}

	const exposeLoginUrl = await shouldExposeDevLoginUrl();

	const result = await inviteOrganizerToEvent(db, {
		event: access.event,
		email,
		name,
		role,
		origin: new URL(request.url).origin,
		exposeLoginUrl,
	});

	if (!result.ok) {
		return NextResponse.json(
			{ ok: false, error: result.error },
			{ status: result.status },
		);
	}

	return NextResponse.json({
		ok: true,
		createdMembership: result.createdMembership,
		transferredOwnership: result.transferredOwnership,
		emailStatus: result.emailStatus,
		loginUrl: result.loginUrl,
		member: {
			accountId: result.account.id,
			email: result.account.email,
			name: result.account.name,
			role: result.membership.role,
		},
	});
}

export async function DELETE(request: Request, context: RouteContext) {
	const { eventSlug } = await context.params;
	const db = await getDb();
	const access = await authorizeEventAdminApi(db, eventSlug);
	if (!access) {
		return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
	}

	const bypass = await isAdminBypass();
	if (access.membership?.role !== "owner" && !bypass) {
		return NextResponse.json(
			{ ok: false, error: "Only the event owner can remove organizers" },
			{ status: 403 },
		);
	}

	let body: { accountId?: unknown };
	try {
		body = (await request.json()) as { accountId?: unknown };
	} catch {
		return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
	}

	const accountId =
		typeof body.accountId === "string" ? body.accountId.trim() : "";
	if (!accountId) {
		return NextResponse.json(
			{ ok: false, error: "accountId required" },
			{ status: 400 },
		);
	}

	try {
		const removed = await removeEventMembership(db, {
			eventId: access.event.id,
			accountId,
		});
		if (!removed) {
			return NextResponse.json(
				{ ok: false, error: "Member not found" },
				{ status: 404 },
			);
		}
		return NextResponse.json({ ok: true });
	} catch (error) {
		const message =
			error instanceof Error ? error.message : "Could not remove member";
		return NextResponse.json({ ok: false, error: message }, { status: 400 });
	}
}
