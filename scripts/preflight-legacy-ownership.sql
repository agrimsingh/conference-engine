-- Safe before or after 0012: reports the legacy owner evidence without
-- requiring canonical ownership columns or mutating database state.
SELECT
	e.slug,
	COUNT(m.id) AS legacy_owner_count,
	CASE WHEN COUNT(m.id) = 0 THEN 1 ELSE 0 END AS ownerless
FROM events e
LEFT JOIN event_memberships m ON m.event_id = e.id AND m.role = 'owner'
GROUP BY e.id, e.slug
ORDER BY e.slug;

SELECT COUNT(*) AS duplicate_owner_events
FROM (
	SELECT event_id
	FROM event_memberships
	WHERE role = 'owner'
	GROUP BY event_id
	HAVING COUNT(*) > 1
);
