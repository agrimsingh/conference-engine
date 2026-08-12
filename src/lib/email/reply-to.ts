import type { MessageTemplateKey } from "@/lib/domain/message-templates";
import { isPlausibleEmail, normalizeEmail } from "@/lib/security/crypto";

/**
 * Speaker/reviewer-facing templated sends get Reply-To.
 * Organizer magic-link / invite and organizer submission fan-out stay without it.
 */
const REPLY_TO_TEMPLATE_KEYS = new Set<MessageTemplateKey>([
	"submission_received",
	"acceptance",
	"rejection",
	"waitlist",
	"co_speaker_invite",
	"calendar_invite",
	"calendar_reschedule",
	"speaker_handoff",
	"task_reminder",
	"draft_reminder",
	"speaker_announcement",
	"portal_magic_link",
	"reviewer_invite",
	"reviewer_outstanding_reminder",
]);

export type ReplyToTemplateFamily =
	| "confirmation"
	| "decision"
	| "reminders"
	| "portal_invite"
	| "announcements"
	| "calendar_invites";

export const REPLY_TO_TEMPLATE_FAMILIES: Record<ReplyToTemplateFamily, MessageTemplateKey[]> = {
	confirmation: ["submission_received"],
	decision: ["acceptance", "rejection", "waitlist"],
	reminders: ["task_reminder", "draft_reminder", "reviewer_outstanding_reminder"],
	portal_invite: ["portal_magic_link", "co_speaker_invite", "speaker_handoff", "reviewer_invite"],
	announcements: ["speaker_announcement"],
	calendar_invites: ["calendar_invite", "calendar_reschedule"],
};

export function templateUsesReplyTo(templateKey: MessageTemplateKey): boolean {
	return REPLY_TO_TEMPLATE_KEYS.has(templateKey);
}

export function parseContactEmail(value: unknown): string | null {
	if (value === null || value === undefined) return null;
	if (typeof value !== "string") throw new Error("Contact email must be a string");
	const trimmed = value.trim();
	if (!trimmed) return null;
	if (!isPlausibleEmail(trimmed)) throw new Error("Contact email must be a valid email address");
	return normalizeEmail(trimmed);
}

/** contact_email when set; otherwise the event owner account email. */
export async function resolveEventReplyTo(
	db: D1Database,
	eventId: string,
): Promise<string | null> {
	const row = await db
		.prepare(
			`SELECT e.contact_email AS contact_email, a.email AS owner_email
       FROM events e
       LEFT JOIN event_ownership o ON o.event_id = e.id
       LEFT JOIN accounts a ON a.id = o.account_id
       WHERE e.id = ?`,
		)
		.bind(eventId)
		.first<{ contact_email: string | null; owner_email: string | null }>();
	if (!row) return null;
	const configured = row.contact_email?.trim();
	if (configured && isPlausibleEmail(configured)) return normalizeEmail(configured);
	const owner = row.owner_email?.trim();
	if (owner && isPlausibleEmail(owner)) return normalizeEmail(owner);
	return null;
}
