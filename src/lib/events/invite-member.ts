import { createOrganizerLoginToken } from "@/lib/auth/organizer-session";
import {
	addEventMembership,
	getEventMembership,
	transferEventOwnership,
	upsertAccountByEmail,
} from "@/lib/db/queries";
import type { AccountRow, EventMembershipRow, EventRow } from "@/lib/db/types";
import { sendAuthEmail } from "@/lib/email/resend";

export type InviteRole = "admin" | "owner";

export type InviteOrganizerResult =
	| {
			ok: true;
			account: AccountRow;
			membership: EventMembershipRow;
			createdMembership: boolean;
			transferredOwnership: boolean;
			emailStatus: "sent" | "failed";
			loginUrl: string | null;
	  }
	| { ok: false; error: string; status: number };

export async function inviteOrganizerToEvent(
	db: D1Database,
	args: {
		event: EventRow;
		email: string;
		name?: string;
		role?: InviteRole;
		origin: string;
		exposeLoginUrl: boolean;
	},
): Promise<InviteOrganizerResult> {
	const email = args.email.trim().toLowerCase();
	if (!email.includes("@")) {
		return { ok: false, error: "Valid email required", status: 400 };
	}

	const role: InviteRole = args.role ?? "admin";
	if (role !== "admin" && role !== "owner") {
		return { ok: false, error: "role must be admin or owner", status: 400 };
	}

	const account = await upsertAccountByEmail(db, {
		email,
		name: args.name,
	});

	const existing = await getEventMembership(db, args.event.id, account.id);
	let membership: EventMembershipRow;
	let createdMembership = false;
	let transferredOwnership = false;

	if (existing) {
		membership = existing;
	} else {
		// Always insert as admin first; owner invites promote via transfer below.
		membership = await addEventMembership(db, {
			eventId: args.event.id,
			accountId: account.id,
			role: "admin",
		});
		createdMembership = true;
	}

	if (role === "owner") {
		if (membership.role !== "owner") {
			membership = await transferEventOwnership(db, {
				eventId: args.event.id,
				toAccountId: account.id,
			});
			transferredOwnership = true;
		}
	}

	const { token } = await createOrganizerLoginToken({
		accountId: account.id,
		email: account.email,
	});

	const callbackUrl = new URL("/auth/callback", args.origin);
	callbackUrl.searchParams.set("token", token);
	callbackUrl.searchParams.set(
		"next",
		`/admin/events/${args.event.slug}/team`,
	);
	const loginUrl = callbackUrl.toString();

	const emailResult = await sendAuthEmail({
		toEmail: account.email,
		templateKey: "organizer_invite",
		context: {
			eventName: args.event.name,
			submitterName: account.name.trim() || "there",
			title: args.event.name,
			loginUrl,
		},
	});

	return {
		ok: true,
		account,
		membership,
		createdMembership,
		transferredOwnership,
		emailStatus: emailResult.ok ? "sent" : "failed",
		loginUrl: args.exposeLoginUrl ? loginUrl : null,
	};
}
