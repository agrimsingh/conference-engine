export const MESSAGE_TEMPLATE_KEYS = [
	"submission_received",
	"submission_received_organizer",
	"submission_updated_organizer",
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
	calendarLabel?: string;
	taskLabels?: string[];
	outstandingCount?: number;
	portalUrl?: string;
	adminUrl?: string;
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

const REPLY_CTA = "If anything looks off, just reply to this email.";

const REGISTRY: Record<MessageTemplateKey, TemplateRenderer> = {
	submission_received: (ctx) => ({
		subject: `Thanks for submitting to ${ctx.eventName}`,
		text: [
			`Hey ${ctx.submitterName},`,
			"",
			`Got your proposal "${ctx.title}" for ${ctx.eventName}.`,
			"The program committee will take a look and follow up.",
			...(ctx.portalUrl ? ["", `Track your proposal: ${ctx.portalUrl}`] : []),
			"",
			REPLY_CTA,
		].join("\n"),
	}),
	submission_received_organizer: (ctx) => ({
		subject: `New submission: ${ctx.title}`,
		text: [
			`Hi ${ctx.submitterName},`,
			"",
			`A new proposal "${ctx.title}" was submitted to ${ctx.eventName}.`,
			...(ctx.portalHint ? [ctx.portalHint] : []),
			ctx.adminUrl ? `Open the submission: ${ctx.adminUrl}` : "Open the event admin to review it.",
			"",
			"— conference-engine",
		].join("\n"),
	}),
	submission_updated_organizer: (ctx) => ({
		subject: `Updated submission: ${ctx.title}`,
		text: [
			`Hi ${ctx.submitterName},`,
			"",
			`The proposal "${ctx.title}" for ${ctx.eventName} was updated by the submitter.`,
			...(ctx.portalHint ? [ctx.portalHint] : []),
			ctx.adminUrl ? `Open the submission: ${ctx.adminUrl}` : "Open the event admin to review the latest version.",
			"",
			"— conference-engine",
		].join("\n"),
	}),
	acceptance: (ctx) => ({
		subject: `You're accepted: ${ctx.title}`,
		text: [
			`Hey ${ctx.submitterName},`,
			"",
			`Good news: "${ctx.title}" was accepted for ${ctx.eventName}.`,
			ctx.portalHint ?? "Complete your speaker tasks in the portal.",
			...(ctx.portalUrl ? [ctx.portalUrl] : []),
			"",
			REPLY_CTA,
		].join("\n"),
	}),
	rejection: (ctx) => ({
		subject: `Update on your ${ctx.eventName} proposal`,
		text: [
			`Hey ${ctx.submitterName},`,
			"",
			`Thanks for submitting "${ctx.title}" to ${ctx.eventName}.`,
			"We aren't able to accept it for this program.",
			"",
			REPLY_CTA,
		].join("\n"),
	}),
	// Deliberately promise-free: no ticket, comp, or timeline language.
	waitlist: (ctx) => ({
		subject: `Waitlist update: ${ctx.title}`,
		text: [
			`Hey ${ctx.submitterName},`,
			"",
			`Thanks for submitting "${ctx.title}" to ${ctx.eventName}.`,
			"Your proposal is on the waitlist for now. If a slot opens up, we may reach out with next steps.",
			"Nothing you need to do right now.",
			"",
			REPLY_CTA,
		].join("\n"),
	}),
	// Promise-free: no ticket, comp, or travel language. Confirming only
	// verifies the person is real and willing to be listed.
	co_speaker_invite: (ctx) => ({
		subject: `You're listed as a co-speaker: ${ctx.title}`,
		text: [
			`Hey ${ctx.submitterName},`,
			"",
			`You were listed as a co-speaker on "${ctx.title}", a proposal for ${ctx.eventName}.`,
			"Please confirm you're on board:",
			"",
			`Confirm: ${ctx.confirmUrl ?? "(link unavailable)"}`,
			`Decline: ${ctx.declineUrl ?? "(link unavailable)"}`,
			"",
			"If you weren't expecting this, you can decline or ignore this email.",
			"",
			REPLY_CTA,
		].join("\n"),
	}),
	calendar_invite: (ctx) => ({
		subject: `Scheduled: ${ctx.calendarLabel ?? `${ctx.title} — ${ctx.eventName}`}`,
		text: [
			`Hey ${ctx.submitterName},`,
			"",
			`"${ctx.title}" is on the ${ctx.eventName} agenda.`,
			ctx.roomName ? `Room: ${ctx.roomName}` : null,
			ctx.startsAtIso && ctx.endsAtIso
				? `When: ${ctx.startsAtIso} → ${ctx.endsAtIso}`
				: null,
			"",
			"A calendar invite (.ics) is attached.",
			"",
			REPLY_CTA,
		]
			.filter((line): line is string => line !== null)
			.join("\n"),
	}),
	calendar_reschedule: (ctx) => ({
		subject: `Time changed: ${ctx.calendarLabel ?? `${ctx.title} — ${ctx.eventName}`}`,
		text: [
			`Hey ${ctx.submitterName},`,
			"",
			`The scheduled time for "${ctx.title}" at ${ctx.eventName} changed.`,
			ctx.roomName ? `Room: ${ctx.roomName}` : null,
			ctx.startsAtIso && ctx.endsAtIso
				? `When: ${ctx.startsAtIso} → ${ctx.endsAtIso}`
				: null,
			"",
			"A calendar update (.ics) is attached. Please confirm you can still make it in the speaker portal:",
			ctx.portalUrl ?? "(link unavailable)",
			"",
			REPLY_CTA,
		]
			.filter((line): line is string => line !== null)
			.join("\n"),
	}),
	speaker_handoff: (ctx) => ({
		subject: `Can you manage "${ctx.title}" for ${ctx.eventName}?`,
		text: [
			`Hey ${ctx.submitterName},`,
			"",
			`A speaker asked you to manage "${ctx.title}" for ${ctx.eventName}.`,
			"You can complete onboarding and confirm the slot on their behalf.",
			"",
			`Accept: ${ctx.confirmUrl ?? "(link unavailable)"}`,
			`Decline: ${ctx.declineUrl ?? "(link unavailable)"}`,
			"",
			REPLY_CTA,
		].join("\n"),
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
				`Hey ${ctx.submitterName},`,
				"",
				`Quick reminder: you still have ${count} outstanding speaker task${count === 1 ? "" : "s"} for ${ctx.eventName}:`,
				"",
				...taskLines,
				"",
				ctx.portalHint ??
					"Sign in at the speaker portal to complete them: /portal",
				"",
				REPLY_CTA,
			].join("\n"),
		};
	},
	draft_reminder: (ctx) => ({
		subject: `Reminder: finish your ${ctx.eventName} proposal before it closes`,
		text: [
			`Hey ${ctx.submitterName},`,
			"",
			`You've got an unfinished draft for "${ctx.title}" at ${ctx.eventName}.`,
			ctx.endsAtIso ? `This call for proposals closes at ${ctx.endsAtIso}.` : "This call for proposals is closing soon.",
			"",
			"Resume your draft here:",
			ctx.portalUrl ?? ctx.portalHint ?? "(link unavailable)",
			"",
			"If you already submitted or no longer plan to, you can ignore this email.",
			"",
			REPLY_CTA,
		].join("\n"),
	}),
	speaker_announcement: (ctx) => ({
		subject: `Update from ${ctx.eventName}`,
		text: [
			`Hey ${ctx.submitterName},`,
			"",
			ctx.title?.trim() || `Organizers of ${ctx.eventName} sent an update.`,
			"",
			REPLY_CTA,
		].join("\n"),
	}),
	portal_magic_link: (ctx) => ({
		subject: `Your speaker portal link — ${ctx.eventName}`,
		text: [
			`Hey ${ctx.submitterName},`,
			"",
			"Here's a one-time link to open your speaker portal:",
			ctx.portalUrl ?? ctx.portalHint ?? "/portal",
			"",
			"If you didn't request this, you can ignore this email.",
			"",
			REPLY_CTA,
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
			`Hey ${ctx.submitterName},`,
			"",
			`You've been invited to review proposals for ${ctx.eventName}.`,
			"Here's your personal review link (it replaces any earlier one for you):",
			ctx.reviewUrl ?? "/review",
			"",
			"If you didn't expect this invite, you can ignore this email.",
			"",
			REPLY_CTA,
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
				`Hey ${ctx.submitterName},`,
				"",
				`Quick reminder: you still have ${count} incomplete review assignment${count === 1 ? "" : "s"} for ${ctx.eventName}:`,
				"",
				...taskLines,
				"",
				ctx.portalHint ??
					"Open your personal review link from your invite email to finish scoring.",
				"",
				REPLY_CTA,
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
		key !== "calendar_reschedule" &&
		key !== "speaker_handoff" &&
		key !== "task_reminder" &&
		key !== "draft_reminder" &&
		key !== "speaker_announcement" &&
		key !== "portal_magic_link" &&
		key !== "organizer_magic_link" &&
		key !== "organizer_invite" &&
		// Multiple co-speakers per submission + admin resend.
		key !== "co_speaker_invite" &&
		// Fan-out to every event member; email_deliveries dedupes per recipient.
		key !== "submission_received_organizer" &&
		// Distinct edits use deliveryScope; retries share the same scope.
		key !== "submission_updated_organizer" &&
		// Token rotation on regenerate must be able to mail a new link.
		key !== "reviewer_invite" &&
		// Manual outstanding-reviewer nudges may repeat inside a window via deliveryScope.
		key !== "reviewer_outstanding_reminder"
	);
}
