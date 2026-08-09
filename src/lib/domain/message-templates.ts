export const MESSAGE_TEMPLATE_KEYS = [
	"submission_received",
	"acceptance",
	"rejection",
	"waitlist",
	"co_speaker_invite",
	"calendar_invite",
	"task_reminder",
	"speaker_announcement",
	"portal_magic_link",
	"organizer_magic_link",
	"organizer_invite",
	"reviewer_invite",
	"reviewer_outstanding_reminder",
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
	confirmUrl?: string;
	declineUrl?: string;
	loginUrl?: string;
	reviewUrl?: string;
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
	// Deliberately promise-free: no ticket, comp, or timeline language.
	waitlist: (ctx) => ({
		subject: `Waitlist update: ${ctx.title}`,
		text: [
			`Hi ${ctx.submitterName},`,
			"",
			`Thank you for submitting "${ctx.title}" to ${ctx.eventName}.`,
			"Your proposal is currently on the waitlist. If a slot opens up, we may reach out with next steps.",
			"No action is needed from you right now.",
			"",
			"— conference-engine",
		].join("\n"),
	}),
	// Promise-free: no ticket, comp, or travel language. Confirming only
	// verifies the person is real and willing to be listed.
	co_speaker_invite: (ctx) => ({
		subject: `You're listed as a co-speaker: ${ctx.title}`,
		text: [
			`Hi ${ctx.submitterName},`,
			"",
			`You were listed as a co-speaker on "${ctx.title}", a proposal for ${ctx.eventName}.`,
			"Please confirm your participation so organizers know you're on board:",
			"",
			`Confirm: ${ctx.confirmUrl ?? "(link unavailable)"}`,
			`Decline: ${ctx.declineUrl ?? "(link unavailable)"}`,
			"",
			"If you weren't expecting this, you can decline or ignore this email.",
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
	speaker_announcement: (ctx) => ({
		subject: `Update from ${ctx.eventName}`,
		text: [
			`Hi ${ctx.submitterName},`,
			"",
			ctx.title?.trim() || `Organizers of ${ctx.eventName} sent an update.`,
			"",
			"— conference-engine",
		].join("\n"),
	}),
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
	organizer_magic_link: (ctx) => ({
		subject: "Sign in to conference-engine organizer",
		text: [
			`Hi ${ctx.submitterName},`,
			"",
			"Use this one-time link to open the organizer admin:",
			ctx.loginUrl ?? "/auth/callback",
			"",
			"If you did not request this, you can ignore this email.",
			"",
			"— conference-engine",
		].join("\n"),
	}),
	organizer_invite: (ctx) => ({
		subject: `You're invited to organize ${ctx.eventName}`,
		text: [
			`Hi ${ctx.submitterName},`,
			"",
			`You've been added as an organizer on ${ctx.eventName}.`,
			"Open this one-time link to sign in and access the event admin:",
			ctx.loginUrl ?? "/auth/callback",
			"",
			"If you did not expect this invite, you can ignore this email.",
			"",
			"— conference-engine",
		].join("\n"),
	}),
	reviewer_invite: (ctx) => ({
		subject: `Review invitations for ${ctx.eventName}`,
		text: [
			`Hi ${ctx.submitterName},`,
			"",
			`You've been invited to review proposals for ${ctx.eventName}.`,
			"Open this personal review link (it replaces any earlier link for you):",
			ctx.reviewUrl ?? "/review",
			"",
			"If you did not expect this invite, you can ignore this email.",
			"",
			"— conference-engine",
		].join("\n"),
	}),
	reviewer_outstanding_reminder: (ctx) => {
		const count = ctx.outstandingCount ?? ctx.taskLabels?.length ?? 0;
		const labels = ctx.taskLabels ?? [];
		const taskLines =
			labels.length > 0
				? labels.map((label) => `• ${label}`)
				: ["• (see your review board for details)"];
		return {
			subject: `Reminder: ${count} outstanding review${count === 1 ? "" : "s"} for ${ctx.eventName}`,
			text: [
				`Hi ${ctx.submitterName},`,
				"",
				`You still have ${count} incomplete review assignment${count === 1 ? "" : "s"} for ${ctx.eventName}:`,
				"",
				...taskLines,
				"",
				ctx.portalHint ??
					"Open your personal review link from your invite email to finish scoring.",
				"",
				"— conference-engine",
			].join("\n"),
		};
	},
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
		key !== "speaker_announcement" &&
		key !== "portal_magic_link" &&
		key !== "organizer_magic_link" &&
		key !== "organizer_invite" &&
		// Multiple co-speakers per submission + admin resend.
		key !== "co_speaker_invite" &&
		// Token rotation on regenerate must be able to mail a new link.
		key !== "reviewer_invite" &&
		// Manual outstanding-reviewer nudges may repeat inside a window via deliveryScope.
		key !== "reviewer_outstanding_reminder"
	);
}
