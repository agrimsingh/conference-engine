import {
	renderMessageTemplate,
	type MessageTemplateContext,
	type MessageTemplateKey,
	type RenderedMessage,
} from "@/lib/domain/message-templates";

/** Templates organizers can change without changing transactional auth mail. */
export const EDITABLE_MESSAGE_TEMPLATE_KEYS = [
	"submission_received",
	"acceptance",
	"rejection",
	"waitlist",
	"portal_magic_link",
	"task_reminder",
	"calendar_invite",
] as const;

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

const DEFAULTS: Record<EditableMessageTemplateKey, MessageTemplateDraft> = {
	submission_received: {
		subject: "Thanks for submitting to {{event_name}}",
		text: "Hi {{submitter_name}},\n\nWe received your proposal \"{{title}}\" for {{event_name}}.\nThe program committee will review it and follow up.\n\n— conference-engine",
	},
	acceptance: {
		subject: "You're accepted: {{title}}",
		text: "Hi {{submitter_name}},\n\nCongratulations — \"{{title}}\" was accepted for {{event_name}}.\n{{portal_hint}}\n\n— conference-engine",
	},
	rejection: {
		subject: "Update on your {{event_name}} proposal",
		text: "Hi {{submitter_name}},\n\nThank you for submitting \"{{title}}\" to {{event_name}}.\nWe are unable to accept it for this program.\n\n— conference-engine",
	},
	waitlist: {
		subject: "Waitlist update: {{title}}",
		text: "Hi {{submitter_name}},\n\nThank you for submitting \"{{title}}\" to {{event_name}}.\nYour proposal is currently on the waitlist. If a slot opens up, we may reach out with next steps.\nNo action is needed from you right now.\n\n— conference-engine",
	},
	portal_magic_link: {
		subject: "Sign in to your {{event_name}} speaker portal",
		text: "Hi {{submitter_name}},\n\nUse this one-time link to open your speaker portal:\n{{portal_url}}\n\nIf you did not request this, you can ignore this email.\n\n— conference-engine",
	},
	task_reminder: {
		subject: "Reminder: {{outstanding_count}} outstanding speaker tasks for {{event_name}}",
		text: "Hi {{submitter_name}},\n\nYou still have {{outstanding_count}} outstanding speaker tasks for {{event_name}}:\n\n{{task_list}}\n\n{{portal_hint}}\n\n— conference-engine",
	},
	calendar_invite: {
		subject: "Scheduled: {{title}} @ {{event_name}}",
		text: "Hi {{submitter_name}},\n\n\"{{title}}\" is on the {{event_name}} agenda.\nRoom: {{room_name}}\nWhen: {{starts_at}} → {{ends_at}}\n\nA calendar invite (.ics) is attached.\n\n— conference-engine",
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
		room_name: context.roomName ?? "",
		starts_at: context.startsAtIso ?? "",
		ends_at: context.endsAtIso ?? "",
		outstanding_count: String(context.outstandingCount ?? context.taskLabels?.length ?? 0),
		task_list: (context.taskLabels ?? []).map((label) => `• ${label}`).join("\n") || "• (see portal for details)",
		confirm_url: context.confirmUrl ?? "",
		decline_url: context.declineUrl ?? "",
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
	return renderStoredMessageTemplate(
		saved
			? { subject: saved.subject_template, text: saved.text_template }
			: defaultMessageTemplate(key),
		context,
	);
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
