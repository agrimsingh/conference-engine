export const MESSAGE_TEMPLATE_KEYS = [
	"submission_received",
	"acceptance",
	"rejection",
	"calendar_invite",
	"task_reminder",
	"portal_magic_link",
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
	taskLabels?: string[];
	outstandingCount?: number;
	portalUrl?: string;
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
	task_reminder: (ctx) => {
		const count = ctx.outstandingCount ?? ctx.taskLabels?.length ?? 0;
		const labels = ctx.taskLabels ?? [];
		const taskLines =
			labels.length > 0
				? labels.map((label) => `• ${label}`)
				: ["• (see portal for details)"];
		return {
			subject: `Reminder: ${count} outstanding speaker tasks for ${ctx.eventName}`,
			text: [
				`Hi ${ctx.submitterName},`,
				"",
				`You still have ${count} outstanding speaker task${count === 1 ? "" : "s"} for ${ctx.eventName}:`,
				"",
				...taskLines,
				"",
				ctx.portalHint ??
					"Sign in at the speaker portal to complete them: /portal",
				"",
				"— conference-engine",
			].join("\n"),
		};
	},
	portal_magic_link: (ctx) => ({
		subject: `Sign in to your ${ctx.eventName} speaker portal`,
		text: [
			`Hi ${ctx.submitterName},`,
			"",
			"Use this one-time link to open your speaker portal:",
			ctx.portalUrl ?? ctx.portalHint ?? "/portal",
			"",
			"If you did not request this, you can ignore this email.",
			"",
			"— conference-engine",
		].join("\n"),
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
	return (
		key !== "calendar_invite" &&
		key !== "task_reminder" &&
		key !== "portal_magic_link"
	);
}
