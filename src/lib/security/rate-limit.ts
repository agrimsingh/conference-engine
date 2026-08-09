import { hmacHash } from "./crypto";

export async function consumeFixedWindowRateLimit(
	db: D1Database,
	args: { secret: string; bucket: string; subject: string; limit: number; windowMs: number; now?: number },
): Promise<boolean> {
	if (!Number.isInteger(args.limit) || args.limit < 1 || !Number.isInteger(args.windowMs) || args.windowMs < 1) {
		throw new Error("Invalid rate-limit configuration");
	}
	const now = args.now ?? Date.now();
	const windowStart = Math.floor(now / args.windowMs) * args.windowMs;
	const subjectHash = await hmacHash(args.secret, args.subject);
	const row = await db.prepare(
		`INSERT INTO rate_limit_buckets (bucket, subject_hash, window_start, count, updated_at)
     VALUES (?, ?, ?, 1, ?)
     ON CONFLICT(bucket, subject_hash, window_start) DO UPDATE SET
       count = rate_limit_buckets.count + 1,
       updated_at = excluded.updated_at
     WHERE rate_limit_buckets.count < ?
     RETURNING count`,
	).bind(args.bucket, subjectHash, windowStart, now, args.limit).first<{ count: number }>();
	return row !== null;
}

/** Retention must exceed the longest window in use (currently 60min). */
export const RATE_LIMIT_BUCKET_RETENTION_MS = 24 * 60 * 60_000;

export async function pruneExpiredRateLimitBuckets(
	db: D1Database,
	args?: { now?: number; retentionMs?: number },
): Promise<number> {
	const now = args?.now ?? Date.now();
	const retentionMs = args?.retentionMs ?? RATE_LIMIT_BUCKET_RETENTION_MS;
	const result = await db
		.prepare(`DELETE FROM rate_limit_buckets WHERE window_start < ?`)
		.bind(now - retentionMs)
		.run();
	return result.meta.changes ?? 0;
}
