type OneTimeEmailResult =
	| { ok: true }
	| { ok: false; failureKind: "confirmed" | "ambiguous" };

/** Only an explicit provider/pre-provider rejection proves a link is unusable. */
export function shouldFailOneTimeLinkChallenge(result: OneTimeEmailResult): boolean {
	return !result.ok && result.failureKind === "confirmed";
}

export async function failOneTimeLinkChallengeIfConfirmed(
	db: D1Database,
	args: { tokenHash: string; result: OneTimeEmailResult; reason: string },
): Promise<boolean> {
	if (!shouldFailOneTimeLinkChallenge(args.result)) return false;
	await db.prepare(
		`UPDATE auth_challenges
     SET state = 'failed', failure_reason = ?
     WHERE token_hash = ? AND state = 'active'`,
	).bind(args.reason.slice(0, 1_000), args.tokenHash).run();
	return true;
}
