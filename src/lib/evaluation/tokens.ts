import { toBase64Url } from "@/lib/security/crypto";

const encoder = new TextEncoder();

/** A SHA-256 digest is sufficient here: bearer tokens are 128 bits of random
 * entropy, and the digest lets D1 use an indexed equality lookup. */
export async function digestReviewToken(token: string): Promise<string> {
	const digest = await crypto.subtle.digest("SHA-256", encoder.encode(token));
	return toBase64Url(new Uint8Array(digest));
}

export function storedTokenMarker(id: string): string {
	return `digest:${id}`;
}

export function newReviewToken(): string {
	return crypto.randomUUID().replace(/-/g, "");
}

/**
 * Converts rows created before digest storage existed. This is deliberately
 * idempotent and keeps the old bearer usable during the first post-upgrade
 * evaluation request, then replaces the stored raw value with a marker.
 */
export async function backfillEvaluationTokenDigests(db: D1Database): Promise<void> {
	const [plans, reviewers] = await Promise.all([
		db.prepare(`SELECT id, reviewer_token FROM evaluation_plans WHERE reviewer_token_digest IS NULL`).all<{ id: string; reviewer_token: string }>(),
		db.prepare(`SELECT id, token FROM reviewers WHERE token_digest IS NULL`).all<{ id: string; token: string }>(),
	]);
	const statements: D1PreparedStatement[] = [];
	for (const plan of plans.results) {
		if (!plan.reviewer_token || plan.reviewer_token.startsWith("digest:")) continue;
		statements.push(db.prepare(`UPDATE evaluation_plans SET reviewer_token = ?, reviewer_token_digest = ? WHERE id = ? AND reviewer_token_digest IS NULL`)
			.bind(storedTokenMarker(plan.id), await digestReviewToken(plan.reviewer_token), plan.id));
	}
	for (const reviewer of reviewers.results) {
		if (!reviewer.token || reviewer.token.startsWith("digest:")) continue;
		statements.push(db.prepare(`UPDATE reviewers SET token = ?, token_digest = ? WHERE id = ? AND token_digest IS NULL`)
			.bind(storedTokenMarker(reviewer.id), await digestReviewToken(reviewer.token), reviewer.id));
	}
	if (statements.length) await db.batch(statements);
}
