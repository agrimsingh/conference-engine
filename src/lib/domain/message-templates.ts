export const MESSAGE_TEMPLATE_KEYS = [
	"submission_received",
	"acceptance",
	"rejection",
	"calendar_invite",
] as const;

export type MessageTemplateKey = (typeof MESSAGE_TEMPLATE_KEYS)[number];

export type MessageTemplateContext = {
	eventName: string;
	submitterName: string;
	title: string;
	portalHint?: string;
	roomName?: string;
	startsAtIso?: string;
	endsAtIso?: string;
};

export type RenderedMessage = {
	subject: string;
	text: string;
};

type TemplateRenderer = (ctx: MessageTemplateContext) => RenderedMessage;

const REGISTRY: Record<MessageTemplateKey, TemplateRenderer> = {
	submission_received: (ctx) => ({
		subject: `Thanks for submitting to ${ctx.eventName}`,
		text: [
			`Hi ${ctx.submitterName},`,
			"",
			`We received your proposal "${ctx.title}" for ${ctx.eventName}.`,
			"The program committee will review it and follow up.",
			"",
			"— conference-engine",
		].join("\n"),
	}),
	acceptance: (ctx) => ({
		subject: `You're accepted: ${ctx.title}`,
		text: [
			`Hi ${ctx.submitterName},`,
			"",
			`Congratulations — "${ctx.title}" was accepted for ${ctx.eventName}.`,
			ctx.portalHint ?? "Complete your speaker tasks in the portal when you receive a link.",
			"",
			"— conference-engine",
		].join("\n"),
	}),
	rejection: (ctx) => ({
		subject: `Update on your ${ctx.eventName} proposal`,
		text: [
			`Hi ${ctx.submitterName},`,
			"",
			`Thank you for submitting "${ctx.title}" to ${ctx.eventName}.`,
			"We are unable to accept it for this program.",
			"",
			"— conference-engine",
		].join("\n"),
	}),
	calendar_invite: (ctx) => ({
		subject: `Scheduled: ${ctx.title} @ ${ctx.eventName}`,
		text: [
			`Hi ${ctx.submitterName},`,
			"",
			`"${ctx.title}" is on the ${ctx.eventName} agenda.`,
			ctx.roomName ? `Room: ${ctx.roomName}` : null,
			ctx.startsAtIso && ctx.endsAtIso
				? `When: ${ctx.startsAtIso} → ${ctx.endsAtIso}`
				: null,
			"",
			"A calendar invite (.ics) is attached.",
			"",
			"— conference-engine",
		]
			.filter((line): line is string => line !== null)
			.join("\n"),
	}),
};

export function isMessageTemplateKey(value: string): value is MessageTemplateKey {
	return (MESSAGE_TEMPLATE_KEYS as readonly string[]).includes(value);
}

export function renderMessageTemplate(
	key: MessageTemplateKey,
	ctx: MessageTemplateContext,
): RenderedMessage {
	return REGISTRY[key](ctx);
}

export function isOneShotTemplate(key: MessageTemplateKey): boolean {
	return key !== "calendar_invite";
}
