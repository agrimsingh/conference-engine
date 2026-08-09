export type DeliveryHistoryRow = {
	delivery_key: string;
	submission_id: string | null;
	template_key: string;
	to_email: string;
	subject: string;
	status: "reserved" | "sending" | "provider_accepted" | "sent" | "failed";
	provider_id: string | null;
	error: string | null;
	attempt_count: number;
	updated_at: number;
	sent_at: number | null;
	replayable: number;
};

export type ReminderRecipientRow = {
	person_id: string;
	email: string;
	name: string | null;
	pending_count: number;
	last_delivery_status: DeliveryHistoryRow["status"] | null;
	last_delivery_at: number | null;
};

/** Bounded event-scoped audit view; never joins deliveries across tenants. */
export async function listEventDeliveryHistory(
	db: D1Database,
	eventId: string,
	limit = 100,
): Promise<DeliveryHistoryRow[]> {
	const result = await db.prepare(
		`SELECT d.delivery_key, d.submission_id, d.template_key, d.to_email, d.subject, d.status,
			d.provider_id, d.error, d.attempt_count, d.updated_at, d.sent_at,
			EXISTS (SELECT 1 FROM email_delivery_envelopes e WHERE e.delivery_key = d.delivery_key) AS replayable
		 FROM email_deliveries d WHERE d.event_id = ?
		 ORDER BY updated_at DESC LIMIT ?`,
	).bind(eventId, Math.max(1, Math.min(limit, 200))).all<DeliveryHistoryRow>();
	return result.results;
}

/** One manual reminder is still one email per person/event, even with many tasks. */
export async function listReminderRecipients(
	db: D1Database,
	eventId: string,
): Promise<ReminderRecipientRow[]> {
	const result = await db.prepare(
		`SELECT
			st.person_id AS person_id,
			p.email AS email,
			p.name AS name,
			COUNT(*) AS pending_count,
			(
				SELECT d.status FROM email_deliveries d
				WHERE d.event_id = st.event_id
					AND d.template_key = 'task_reminder'
					AND lower(d.to_email) = lower(p.email)
				ORDER BY d.updated_at DESC LIMIT 1
			) AS last_delivery_status,
			(
				SELECT d.updated_at FROM email_deliveries d
				WHERE d.event_id = st.event_id
					AND d.template_key = 'task_reminder'
					AND lower(d.to_email) = lower(p.email)
				ORDER BY d.updated_at DESC LIMIT 1
			) AS last_delivery_at
		 FROM speaker_tasks st
		 JOIN people p ON p.id = st.person_id
		 WHERE st.event_id = ? AND st.status = 'pending' AND st.template_required = 1
		 GROUP BY st.person_id, p.email, p.name
		 ORDER BY p.email COLLATE NOCASE ASC`,
	).bind(eventId).all<ReminderRecipientRow>();
	return result.results;
}
