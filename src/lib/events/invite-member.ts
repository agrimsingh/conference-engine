import { createAuthChallenge, hashAuthChallengeToken } from "@/lib/auth/challenges";
import { upsertAccountByEmail } from "@/lib/db/queries";
import type { AccountRow, EventRow } from "@/lib/db/types";
import { sendAuthEmail } from "@/lib/email/resend";

export type InviteRole = "admin" | "owner";
export type InvitationEmailStatus = "sent" | "uncertain" | "failed";

export function hasPendingInvitationAcceptance(status: InvitationEmailStatus): boolean {
	return status !== "failed";
}

export type InviteOrganizerResult =
	| {
			ok: true;
			account: AccountRow;
			invitationId: string;
			role: InviteRole;
			emailStatus: InvitationEmailStatus;
			loginUrl: string | null;
		  }
	| { ok: false; error: string; status: number };

/**
 * An invitation deliberately creates no membership. This prevents a typo or a
 * provider failure from changing an event's access list or canonical owner.
 */
export async function inviteOrganizerToEvent(
	db: D1Database,
	args: {
		event: EventRow;
		email: string;
		name?: string;
		role?: InviteRole;
		origin: string;
		exposeLoginUrl: boolean;
		secret: string;
		invitedByAccountId?: string | null;
		sendEmail?: typeof sendAuthEmail;
	},
): Promise<InviteOrganizerResult> {
	const email = args.email.trim().toLowerCase();
	if (!email.includes("@")) return { ok: false, error: "Valid email required", status: 400 };
	const role: InviteRole = args.role ?? "admin";
	if (role !== "admin" && role !== "owner") return { ok: false, error: "role must be admin or owner", status: 400 };

	const account = await upsertAccountByEmail(db, { email, name: args.name });
	const challenge = await createAuthChallenge(db, {
		secret: args.secret,
		kind: "event_invite",
		accountId: account.id,
		eventId: args.event.id,
	});
	const invitationId = crypto.randomUUID();
	const now = Date.now();
	await db.prepare(
		`INSERT INTO event_invitations (
       id, event_id, account_id, email, name, role, token_hash, status,
		invited_by_account_id, created_at, updated_at, delivered_at
	) VALUES (?, ?, ?, ?, ?, ?, ?, 'delivered', ?, ?, ?, ?)`,
	).bind(
		invitationId,
		args.event.id,
		account.id,
		account.email,
		account.name,
		role,
		challenge.tokenHash,
		args.invitedByAccountId ?? null,
		now,
		now,
		now,
	).run();
	// The acceptance gate is durable before provider I/O. If the provider
	// accepts and a worker later dies, the emailed one-time link still works.

	const callbackUrl = new URL("/auth/callback", args.origin);
	callbackUrl.searchParams.set("token", challenge.token);
	callbackUrl.searchParams.set("next", `/admin/events/${args.event.slug}/team`);
	const loginUrl = callbackUrl.toString();
	const emailResult = await (args.sendEmail ?? sendAuthEmail)({
		toEmail: account.email,
		templateKey: "organizer_invite",
		context: {
			eventName: args.event.name,
			submitterName: account.name.trim() || "there",
			title: args.event.name,
			loginUrl,
		},
		idempotencyKey: challenge.tokenHash,
	});

	if (!emailResult.ok && emailResult.failureKind === "confirmed") {
		await db.batch([
			db.prepare("UPDATE event_invitations SET status = 'failed', updated_at = ? WHERE id = ? AND status = 'delivered'").bind(Date.now(), invitationId),
			db.prepare(
				`UPDATE auth_challenges SET state = 'failed', failure_reason = ?
				 WHERE token_hash = ? AND state = 'active'
				   AND EXISTS (SELECT 1 FROM event_invitations WHERE id = ? AND status = 'failed')`,
			).bind((emailResult.error ?? "mail delivery failed").slice(0, 1_000), challenge.tokenHash, invitationId),
		]);
		return { ok: true, account, invitationId, role, emailStatus: "failed", loginUrl: args.exposeLoginUrl ? loginUrl : null };
	}
	return {
		ok: true,
		account,
		invitationId,
		role,
		emailStatus: emailResult.ok ? "sent" : "uncertain",
		loginUrl: args.exposeLoginUrl ? loginUrl : null,
	};
}

/**
 * Accept the invitation and move ownership in one D1 batch. The first update
 * only succeeds while the challenge is still active, so a replay has no effect.
 */
export async function acceptEventInvitation(
	db: D1Database,
	args: { secret: string; token: string; now?: number },
): Promise<{ accountId: string; eventId: string } | null> {
	if (!args.token) return null;
	const tokenHash = await hashAuthChallengeToken(args.secret, args.token);
	const invitation = await db.prepare(
		`SELECT id, event_id, account_id, role
     FROM event_invitations WHERE token_hash = ? AND status = 'delivered'`,
	).bind(tokenHash).first<{ id: string; event_id: string; account_id: string; role: InviteRole }>();
	if (!invitation) return null;
	const now = args.now ?? Date.now();
	const membershipId = crypto.randomUUID();
	const result = await db.batch([
		db.prepare(
			`UPDATE event_invitations
       SET status = 'accepted', accepted_at = ?, updated_at = ?
       WHERE id = ? AND status = 'delivered'
         AND EXISTS (
           SELECT 1 FROM auth_challenges
           WHERE token_hash = ? AND kind = 'event_invite'
             AND state = 'active' AND expires_at >= ?
         )
         AND EXISTS (
           SELECT 1 FROM event_memberships
           WHERE event_id = event_invitations.event_id
             AND account_id = event_invitations.invited_by_account_id
         )
         AND (
           role != 'owner' OR EXISTS (
             SELECT 1 FROM event_ownership
             WHERE event_id = event_invitations.event_id
               AND account_id = event_invitations.invited_by_account_id
           )
         )`,
		).bind(now, now, invitation.id, tokenHash, now),
		db.prepare(
			`INSERT OR IGNORE INTO event_memberships (id, event_id, account_id, role, created_at)
       SELECT ?, ?, ?, 'admin', ?
       WHERE EXISTS (
         SELECT 1 FROM event_invitations
         WHERE id = ? AND status = 'accepted' AND accepted_at = ?
       )`,
		).bind(membershipId, invitation.event_id, invitation.account_id, now, invitation.id, now),
		db.prepare(
			`UPDATE event_ownership
       SET account_id = ?, updated_at = ?
       WHERE event_id = ?
         AND EXISTS (
           SELECT 1 FROM event_invitations
           WHERE id = ? AND role = 'owner' AND status = 'accepted' AND accepted_at = ?
         )`,
		).bind(invitation.account_id, now, invitation.event_id, invitation.id, now),
		db.prepare(
			`UPDATE auth_challenges
       SET state = 'consumed', consumed_at = ?
			 WHERE token_hash = ? AND kind = 'event_invite' AND state = 'active' AND expires_at >= ?
			   AND EXISTS (
			     SELECT 1 FROM event_invitations
			     WHERE id = ? AND status = 'accepted' AND accepted_at = ?
			   )`,
		).bind(now, tokenHash, now, invitation.id, now),
	]);
	if ((result[0]?.meta.changes ?? 0) === 0) {
		// A removed inviter (and, for owner invitations, a former owner) cannot
		// grant access later. Record that terminal state for support/UI.
		await db.batch([
			db.prepare(
				`UPDATE event_invitations
       SET status = 'failed', updated_at = ?
				WHERE id = ? AND status = 'delivered'
				  AND (
				    NOT EXISTS (
				      SELECT 1 FROM event_memberships
				      WHERE event_id = event_invitations.event_id
				        AND account_id = event_invitations.invited_by_account_id
				    )
				    OR (role = 'owner' AND NOT EXISTS (
				      SELECT 1 FROM event_ownership
				      WHERE event_id = event_invitations.event_id
				        AND account_id = event_invitations.invited_by_account_id
				    ))
				  )`,
			).bind(Date.now(), invitation.id),
			db.prepare(
				`UPDATE auth_challenges
         SET state = 'failed', failure_reason = 'inviter no longer has event access'
         WHERE token_hash = ? AND state = 'active'
           AND EXISTS (SELECT 1 FROM event_invitations WHERE id = ? AND status = 'failed')`,
			).bind(tokenHash, invitation.id),
		]);
		return null;
	}
	return { accountId: invitation.account_id, eventId: invitation.event_id };
}
