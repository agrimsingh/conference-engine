import {
	renderMessageTemplate,
	type MessageTemplateContext,
	type MessageTemplateKey,
	type RenderedMessage,
} from "./message-templates";
import type { SubmissionStatus } from "./submission-status";

export const DECISION_ACTIONS = ["accept", "waitlist", "reject"] as const;

export type DecisionAction = (typeof DECISION_ACTIONS)[number];

export type DecisionTemplateKey = Extract<
	MessageTemplateKey,
	"acceptance" | "rejection" | "waitlist"
>;

export type DecisionMeta = {
	action: DecisionAction;
	targetStatus: SubmissionStatus;
	templateKey: DecisionTemplateKey;
	label: string;
	pendingLabel: string;
};

export const DECISION_REGISTRY: Record<DecisionAction, DecisionMeta> = {
	accept: {
		action: "accept",
		targetStatus: "accepted",
		templateKey: "acceptance",
		label: "Accept",
		pendingLabel: "Accepting…",
	},
	waitlist: {
		action: "waitlist",
		targetStatus: "waitlisted",
		templateKey: "waitlist",
		label: "Waitlist",
		pendingLabel: "Waitlisting…",
	},
	reject: {
		action: "reject",
		targetStatus: "rejected",
		templateKey: "rejection",
		label: "Reject",
		pendingLabel: "Rejecting…",
	},
};

export function isDecisionAction(value: string): value is DecisionAction {
	return (DECISION_ACTIONS as readonly string[]).includes(value);
}

/**
 * The organizer's per-send email choice, made in the confirmation step.
 * A decision never sends email implicitly; the caller states intent.
 */
export type DecisionEmailChoice =
	| { send: false }
	| { send: true; subject: string; text: string; portalUrl?: string };

export const ACCEPTANCE_PORTAL_HINT =
	"Sign in with your speaker email to complete bio, headshot, slides, and supporting docs.";

/** Prefills the confirmation step with the rendered template per action. */
export function renderDecisionPreviews(
	ctx: MessageTemplateContext,
): Record<DecisionAction, RenderedMessage> {
	return {
		accept: renderMessageTemplate("acceptance", {
			...ctx,
			portalHint: ACCEPTANCE_PORTAL_HINT,
		}),
		waitlist: renderMessageTemplate("waitlist", ctx),
		reject: renderMessageTemplate("rejection", ctx),
	};
}
