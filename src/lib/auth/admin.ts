import { NextResponse } from "next/server";
import { notFound, redirect } from "next/navigation";
import { getCloudflareEnv } from "@/lib/db/cloudflare";
import {
	getEventBySlug,
	getEventMembership,
	listAllEvents,
	listEventsForAccount,
} from "@/lib/db/queries";
import type { AccountRow, EventMembershipRow, EventRow } from "@/lib/db/types";
import {
	getOrganizerAccount,
	readOrganizerSessionFromCookie,
} from "@/lib/auth/organizer-session";
import { DemoEventWriteError, assertEventWritable } from "@/lib/events/writability";
export { ADMIN_EVENT_MUTATION_FAMILIES } from "@/lib/events/admin-mutation-families";

export const ADMIN_BYPASS_COOKIE = "ce_admin_bypass";

export async function isAdminBypassEnabled(): Promise<boolean> {
	const env = await getCloudflareEnv();
	return String(env.ADMIN_BYPASS_ENABLED) === "1" || env.NEXTJS_ENV === "development";
}

/** True only when bypass is allowed in this environment AND the cookie is set. */
export async function isAdminBypass(): Promise<boolean> {
	if (!(await isAdminBypassEnabled())) return false;
	const { cookies } = await import("next/headers");
	const jar = await cookies();
	return jar.get(ADMIN_BYPASS_COOKIE)?.value === "1";
}

export async function requireAdminBypass(): Promise<void> {
	if (!(await isAdminBypass())) {
		throw new Error("Admin bypass cookie required (local demo auth)");
	}
}

export async function getCurrentOrganizerAccount(
	db: D1Database,
): Promise<AccountRow | null> {
	const session = await readOrganizerSessionFromCookie();
	if (!session) return null;
	return getOrganizerAccount(db, session);
}

export async function requireOrganizer(db: D1Database): Promise<AccountRow> {
	const account = await getCurrentOrganizerAccount(db);
	if (account) return account;
	if (await isAdminBypass()) {
		throw new Error("Organizer session required (bypass alone is not an account)");
	}
	redirect("/login?next=/admin");
}

export type EventAdminAccess = {
	event: EventRow;
	account: AccountRow | null;
	membership: EventMembershipRow | null;
};

export type WritableEventAdminApiAccess =
	| { ok: true; access: EventAdminAccess }
	| { ok: false; response: NextResponse };

export async function resolveEventAdminAccess(
	db: D1Database,
	eventSlug: string,
): Promise<EventAdminAccess | null> {
	const event = await getEventBySlug(db, eventSlug);
	if (!event) return null;

	if (await isAdminBypass()) {
		const session = await readOrganizerSessionFromCookie();
		if (!session) {
			return { event, account: null, membership: null };
		}
		const account = await getOrganizerAccount(db, session);
		if (!account) {
			return { event, account: null, membership: null };
		}
		const membership = await getEventMembership(db, event.id, account.id);
		return { event, account, membership };
	}

	const session = await readOrganizerSessionFromCookie();
	if (!session) return null;

	const account = await getOrganizerAccount(db, session);
	if (!account) return null;

	const membership = await getEventMembership(db, event.id, account.id);
	if (!membership) return null;

	return { event, account, membership };
}

export async function assertCanManageEvent(
	db: D1Database,
	eventSlug: string,
): Promise<EventAdminAccess> {
	const event = await getEventBySlug(db, eventSlug);
	if (!event) notFound();

	const access = await resolveEventAdminAccess(db, eventSlug);
	if (access) return access;

	const session = await readOrganizerSessionFromCookie();
	if (session || (await isAdminBypass())) {
		redirect("/admin");
	}

	const next = `/admin/events/${eventSlug}/submissions`;
	redirect(`/login?next=${encodeURIComponent(next)}`);
}

export async function authorizeEventAdminApi(
	db: D1Database,
	eventSlug: string,
): Promise<EventAdminAccess | null> {
	const access = await resolveEventAdminAccess(db, eventSlug);
	return access;
}

/**
 * Tenant authorization comes first so a local bypass can still inspect demo
 * data, but no authorized principal can mutate an event marked as a demo.
 */
export async function authorizeWritableEventAdminApi(
	db: D1Database,
	eventSlug: string,
): Promise<WritableEventAdminApiAccess> {
	const access = await authorizeEventAdminApi(db, eventSlug);
	if (!access) {
		return {
			ok: false,
			response: NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 }),
		};
	}
	try {
		assertEventWritable(access.event);
	} catch (error) {
		if (error instanceof DemoEventWriteError) {
			return {
				ok: false,
				response: NextResponse.json({ ok: false, error: "This demo event is read-only" }, { status: 403 }),
			};
		}
		throw error;
	}
	return { ok: true, access };
}

export async function requireEventOrganizer(
	db: D1Database,
	eventSlug: string,
): Promise<EventAdminAccess> {
	const access = await resolveEventAdminAccess(db, eventSlug);
	if (!access) {
		throw new Error("Unauthorized");
	}
	if (!(await isAdminBypass()) && !access.membership) {
		throw new Error("Unauthorized");
	}
	return access;
}

export async function hasAdminAccess(db: D1Database): Promise<boolean> {
	if (await isAdminBypass()) return true;
	const account = await getCurrentOrganizerAccount(db);
	return account !== null;
}

export async function listAccessibleEvents(
	db: D1Database,
): Promise<{ events: EventRow[]; bypass: boolean; account: AccountRow | null }> {
	const bypass = await isAdminBypass();
	const account = await getCurrentOrganizerAccount(db);

	if (bypass) {
		return { events: await listAllEvents(db), bypass: true, account };
	}

	if (!account) {
		return { events: [], bypass: false, account: null };
	}

	return {
		events: await listEventsForAccount(db, account.id),
		bypass: false,
		account,
	};
}

export async function shouldExposeDevLoginUrl(): Promise<boolean> {
	if (await isAdminBypass()) return true;
	const env = await getCloudflareEnv();
	return (
		process.env.NODE_ENV === "development" || env.NEXTJS_ENV === "development"
	);
}
