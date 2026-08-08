-- Run this after applying 0012 (and in deployment checks). The migration itself
-- guards legacy owner roles before normalizing them; this query verifies the
-- resulting canonical relation never leaves an implicit claimant.
-- This INSERT produces no row on success. On ambiguity it intentionally hits
-- the existing non-negative CHECK, causing the D1 command to fail closed.
INSERT INTO rate_limit_buckets (bucket, subject_hash, window_start, count, updated_at)
SELECT 'preflight', 'ownership-ambiguity', 0, -1, 0
WHERE EXISTS (
	SELECT 1
	FROM events e
	LEFT JOIN event_ownership o ON o.event_id = e.id
	GROUP BY e.id
	HAVING (COUNT(o.event_id) = 0 AND MAX(e.ownership_claimable) = 0)
);

SELECT 'ownership preflight passed' AS result;
