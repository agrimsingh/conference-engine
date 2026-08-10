import { createAuthChallenge } from "@/lib/auth/challenges";

/** Mint a one-time speaker portal sign-in URL (does not send email). */
export async function mintPortalSignInLink(
	db: D1Database,
	args: {
		secret: string;
		personId: string;
		eventId: string;
		origin: string;
		now?: number;
	},
): Promise<{ portalUrl: string; token: string; expiresAt: number }> {
	const challenge = await createAuthChallenge(db, {
		secret: args.secret,
		kind: "portal_login",
		personId: args.personId,
		eventId: args.eventId,
		now: args.now,
	});
	const url = new URL("/portal/authorize", args.origin);
	url.searchParams.set("token", challenge.token);
	return {
		portalUrl: url.toString(),
		token: challenge.token,
		expiresAt: challenge.expiresAt,
	};
}
