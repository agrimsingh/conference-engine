import {
	renderMessageTemplate,
	type MessageTemplateContext,
	type MessageTemplateKey,
	type RenderedMessage,
} from "@/lib/domain/message-templates";
import {
	ACCEPTANCE_PORTAL_HINT,
	DECISION_REGISTRY,
	type DecisionAction,
} from "@/lib/domain/decisions";
import { validatedAppOrigin } from "@/lib/security/origin";

/** Templates organizers can change without changing transactional auth mail. */
export const EDITABLE_MESSAGE_TEMPLATE_KEYS = [
	"submission_received",
	"acceptance",
	"rejection",
	"waitlist",
	"portal_magic_link",
	"task_reminder",
	"speaker_announcement",
	"calendar_invite",
	"calendar_reschedule",
] as const;

/** Safe keys organizers may pick from the roster bulk-email composer. */
export const ROSTER_BULK_EMAIL_KEYS = ["task_reminder", "speaker_announcement"] as const;
export type RosterBulkEmailKey = (typeof ROSTER_BULK_EMAIL_KEYS)[number];

export function isRosterBulkEmailKey(value: string): value is RosterBulkEmailKey {
	return (ROSTER_BULK_EMAIL_KEYS as readonly string[]).includes(value);
}

export type EditableMessageTemplateKey = (typeof EDITABLE_MESSAGE_TEMPLATE_KEYS)[number];

export type MessageTemplateDraft = {
	subject: string;
	text: string;
};

export type EventMessageTemplateRow = {
	id: string;
	event_id: string;
	template_key: EditableMessageTemplateKey;
	subject_template: string;
	text_template: string;
	created_at: number;
	updated_at: number;
};

const REPLY_CTA = "If anything looks off, just reply to this email.";

const DEFAULTS: Record<EditableMessageTemplateKey, MessageTemplateDraft> = {
	submission_received: {
		subject: "Thanks for submitting to {{event_name}}",
		text: `Hey {{submitter_name}},\n\nGot your proposal "{{title}}" for {{event_name}}.\nThe program committee will take a look and follow up.\n\n${REPLY_CTA}`,
	},
	acceptance: {
		subject: "You're accepted: {{title}}",
		text: `Hey {{submitter_name}},\n\nGood news: "{{title}}" was accepted for {{event_name}}.\n{{portal_hint}}\n\n${REPLY_CTA}`,
	},
	rejection: {
		subject: "Update on your {{event_name}} proposal",
		text: `Hey {{submitter_name}},\n\nThanks for submitting "{{title}}" to {{event_name}}.\nWe aren't able to accept it for this program.\n\n${REPLY_CTA}`,
	},
	waitlist: {
		subject: "Waitlist update: {{title}}",
		text: `Hey {{submitter_name}},\n\nThanks for submitting "{{title}}" to {{event_name}}.\nYour proposal is on the waitlist for now. If a slot opens up, we may reach out with next steps.\nNothing you need to do right now.\n\n${REPLY_CTA}`,
	},
	portal_magic_link: {
		subject: "Your speaker portal link — {{event_name}}",
		text: `Hey {{submitter_name}},\n\nHere's a one-time link to open your speaker portal:\n{{portal_url}}\n\nIf you didn't request this, you can ignore this email.\n\n${REPLY_CTA}`,
	},
	task_reminder: {
		subject: "Reminder: {{outstanding_count}} outstanding speaker tasks for {{event_name}}",
		text: `Hey {{submitter_name}},\n\nQuick reminder: you still have {{outstanding_count}} outstanding speaker tasks for {{event_name}}:\n\n{{task_list}}\n\n{{portal_hint}}\n\n${REPLY_CTA}`,
	},
	speaker_announcement: {
		subject: "Update from {{event_name}}",
		text: `Hey {{submitter_name}},\n\n{{title}}\n\n${REPLY_CTA}`,
	},
	calendar_invite: {
		subject: "Scheduled: {{calendar_label}}",
		text: `Hey {{submitter_name}},\n\n"{{title}}" is on the {{event_name}} agenda.\nRoom: {{room_name}}\nWhen: {{starts_at}} → {{ends_at}}\n\nA calendar invite (.ics) is attached.\n\n${REPLY_CTA}`,
	},
	calendar_reschedule: {
		subject: "Time changed: {{calendar_label}}",
		text: `Hey {{submitter_name}},\n\nThe scheduled time for "{{title}}" at {{event_name}} changed.\nRoom: {{room_name}}\nWhen: {{starts_at}} → {{ends_at}}\n\nA calendar update (.ics) is attached. Please confirm you can still make it in the speaker portal:\n{{portal_url}}\n\n${REPLY_CTA}`,
	},
};

export function isEditableMessageTemplateKey(value: string): value is EditableMessageTemplateKey {
	return (EDITABLE_MESSAGE_TEMPLATE_KEYS as readonly string[]).includes(value);
}

export function defaultMessageTemplate(key: EditableMessageTemplateKey): MessageTemplateDraft {
	return { ...DEFAULTS[key] };
}

function tokens(context: MessageTemplateContext): Record<string, string> {
	return {
		event_name: context.eventName,
		submitter_name: context.submitterName,
		title: context.title,
		portal_hint: context.portalHint ?? "",
		portal_url: context.portalUrl ?? context.portalHint ?? "",
		admin_url: context.adminUrl ?? "",
		room_name: context.roomName ?? "",
		starts_at: context.startsAtIso ?? "",
		ends_at: context.endsAtIso ?? "",
		calendar_label: context.calendarLabel ?? `${context.title} — ${context.eventName}`,
		outstanding_count: String(context.outstandingCount ?? context.taskLabels?.length ?? 0),
		task_list: (context.taskLabels ?? []).map((label) => `• ${label}`).join("\n") || "• (see portal for details)",
		confirm_url: context.confirmUrl ?? "",
		decline_url: context.declineUrl ?? "",
	};
}

const PORTAL_LINK_TEMPLATE_KEYS = [
	"submission_received",
	"acceptance",
	"rejection",
	"waitlist",
	"calendar_reschedule",
] as const satisfies readonly MessageTemplateKey[];

const ADMIN_LINK_TEMPLATE_KEYS = [
	"submission_received_organizer",
	"submission_updated_organizer",
] as const satisfies readonly MessageTemplateKey[];

export function absoluteAppUrl(origin: string, pathname: string): string {
	const appOrigin = validatedAppOrigin(origin);
	if (!appOrigin) throw new TypeError("Email links require an absolute HTTP(S) app origin");
	const url = new URL(pathname, `${appOrigin}/`);
	if (url.origin !== appOrigin) throw new TypeError("Email link must stay on the configured app origin");
	return url.toString();
}

export function ensureRequiredMessageLink(
	key: MessageTemplateKey,
	rendered: RenderedMessage,
	context: MessageTemplateContext,
): RenderedMessage {
	const portalRequired = (PORTAL_LINK_TEMPLATE_KEYS as readonly MessageTemplateKey[]).includes(key);
	const adminRequired = (ADMIN_LINK_TEMPLATE_KEYS as readonly MessageTemplateKey[]).includes(key);
	const requiredUrl = portalRequired ? context.portalUrl : adminRequired ? context.adminUrl : undefined;
	if (!requiredUrl) return rendered;
	const url = new URL(requiredUrl);
	if (!validatedAppOrigin(url.origin) || url.protocol !== "https:" && url.protocol !== "http:") {
		throw new TypeError("Email action URL must use an absolute HTTP(S) origin");
	}
	if (portalRequired && (url.pathname !== "/portal" || url.search || url.hash)) {
		throw new TypeError("Decision and confirmation emails must use the token-free portal URL");
	}
	const renderedUrls = rendered.text.match(/https?:\/\/[^\s<>"']+/g) ?? [];
	if (renderedUrls.some((candidate) => {
		try {
			return new URL(candidate).href === url.href;
		} catch {
			return false;
		}
	})) return rendered;
	return { ...rendered, text: `${rendered.text}\n\n${requiredUrl}` };
}

export function renderDecisionMessagePreviews(
	templates: readonly EventMessageTemplateRow[],
	context: MessageTemplateContext & { portalUrl: string },
): Record<DecisionAction, RenderedMessage> {
	const byKey = new Map(templates.map((template) => [template.template_key, template]));
	const render = (action: DecisionAction): RenderedMessage => {
		const key = DECISION_REGISTRY[action].templateKey;
		const saved = byKey.get(key);
		const scopedContext = {
			...context,
			portalHint: key === "acceptance" ? ACCEPTANCE_PORTAL_HINT : context.portalHint,
		};
		return ensureRequiredMessageLink(
			key,
			renderStoredMessageTemplate(
				saved
					? { subject: saved.subject_template, text: saved.text_template }
					: defaultMessageTemplate(key),
				scopedContext,
			),
			scopedContext,
		);
	};
	return {
		accept: render("accept"),
		waitlist: render("waitlist"),
		reject: render("reject"),
	};
}

export function renderStoredMessageTemplate(
	draft: MessageTemplateDraft,
	context: MessageTemplateContext,
): RenderedMessage {
	const values = tokens(context);
	const render = (value: string) => value.replace(/{{([a-z_]+)}}/g, (_all, key: string) => values[key] ?? "");
	return { subject: render(draft.subject).trim(), text: render(draft.text).trim() };
}

export async function getEventMessageTemplate(
	db: D1Database,
	eventId: string,
	key: EditableMessageTemplateKey,
): Promise<EventMessageTemplateRow | null> {
	return db.prepare(
		`SELECT * FROM event_message_templates WHERE event_id = ? AND template_key = ?`,
	).bind(eventId, key).first<EventMessageTemplateRow>();
}

export async function listEventMessageTemplates(
	db: D1Database,
	eventId: string,
): Promise<EventMessageTemplateRow[]> {
	const result = await db.prepare(
		`SELECT * FROM event_message_templates WHERE event_id = ? ORDER BY template_key ASC`,
	).bind(eventId).all<EventMessageTemplateRow>();
	return result.results;
}

/** Falls back to the existing renderer for auth/co-speaker system messages. */
export async function renderEventMessageTemplate(
	db: D1Database,
	eventId: string,
	key: MessageTemplateKey,
	context: MessageTemplateContext,
): Promise<RenderedMessage> {
	if (!isEditableMessageTemplateKey(key)) return renderMessageTemplate(key, context);
	const saved = await getEventMessageTemplate(db, eventId, key);
	return ensureRequiredMessageLink(key, renderStoredMessageTemplate(
		saved
			? { subject: saved.subject_template, text: saved.text_template }
			: defaultMessageTemplate(key),
		context,
	), context);
}

export async function upsertEventMessageTemplate(
	db: D1Database,
	args: { eventId: string; templateKey: EditableMessageTemplateKey; subject: string; text: string },
): Promise<EventMessageTemplateRow> {
	const subject = args.subject.trim();
	const text = args.text.trim();
	if (!subject || !text) throw new Error("Subject and body are required");
	if (subject.length > 500 || text.length > 20_000) throw new Error("Template is too long");
	if (args.templateKey === "portal_magic_link" && !text.includes("{{portal_url}}")) {
		throw new Error("Portal invite templates must include {{portal_url}}");
	}
	const now = Date.now();
	const row = await db.prepare(
		`INSERT INTO event_message_templates (
			id, event_id, template_key, subject_template, text_template, created_at, updated_at
		) VALUES (?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT(event_id, template_key) DO UPDATE SET
			subject_template = excluded.subject_template,
			text_template = excluded.text_template,
			updated_at = excluded.updated_at
		RETURNING *`,
	).bind(crypto.randomUUID(), args.eventId, args.templateKey, subject, text, now, now).first<EventMessageTemplateRow>();
	if (!row) throw new Error("Failed to save message template");
	return row;
}
