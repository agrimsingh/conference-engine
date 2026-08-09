"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
	buttonClasses,
	INPUT_CLASSES,
	noticeClasses,
} from "@/components/ui";
import {
	canTransitionSubmission,
	isSubmissionStatus,
} from "@/lib/domain/submission-status";
import {
	DECISION_ACTIONS,
	DECISION_REGISTRY,
	type DecisionAction,
} from "@/lib/domain/decisions";
import { type RenderedMessage } from "@/lib/domain/message-templates";

type Props = {
	eventSlug: string;
	submissionId: string;
	status: string;
	previews: Record<DecisionAction, RenderedMessage>;
};

const ACTION_VARIANTS: Record<string, string> = {
	accept: buttonClasses("primary", "sm"),
	reject: `${buttonClasses("secondary", "sm")} text-red-400`,
};

/**
 * Decision actions with an explicit email confirmation step. Clicking an
 * action opens the rendered email for review/editing with a send toggle;
 * confirming applies the status change and sends only if the toggle is on.
 */
export function DecisionButtons({
	eventSlug,
	submissionId,
	status,
	previews,
}: Props) {
	const router = useRouter();
	const [openAction, setOpenAction] = useState<DecisionAction | null>(null);
	const [sendEmail, setSendEmail] = useState(false);
	const [subject, setSubject] = useState("");
	const [text, setText] = useState("");
	const [pending, setPending] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const legalActions = DECISION_ACTIONS.filter(
		(action) =>
			isSubmissionStatus(status) &&
			canTransitionSubmission(status, DECISION_REGISTRY[action].targetStatus),
	);

	if (legalActions.length === 0) return null;

	function openConfirm(action: DecisionAction) {
		setOpenAction(action);
		setSendEmail(false);
		setSubject(previews[action].subject);
		setText(previews[action].text);
		setError(null);
	}

	async function confirm(action: DecisionAction) {
		setPending(true);
		setError(null);
		try {
			const response = await fetch(
				`/api/admin/events/${eventSlug}/submissions/${submissionId}/decide`,
				{
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({
						action,
						email: sendEmail ? { send: true, subject, text } : { send: false },
					}),
				},
			);
			const data = (await response.json()) as { ok?: boolean; error?: string };
			if (!response.ok || !data.ok) {
				setError(data.error ?? `${DECISION_REGISTRY[action].label} failed`);
				return;
			}
			setOpenAction(null);
			router.refresh();
		} catch {
			setError("Network error");
		} finally {
			setPending(false);
		}
	}

	return (
		<div className="w-full space-y-2">
			<div className="flex flex-wrap gap-2">
				{legalActions.map((action) => (
					<button
						key={action}
						type="button"
						disabled={pending}
						onClick={() =>
							openAction === action ? setOpenAction(null) : openConfirm(action)
						}
						className={`${
							ACTION_VARIANTS[action] ?? buttonClasses("secondary", "sm")
						}${openAction === action ? " bg-neutral-800" : ""}`}
					>
						{DECISION_REGISTRY[action].label}
					</button>
				))}
			</div>

			{openAction ? (
				<div className="space-y-3 rounded-md border border-neutral-800 bg-neutral-950/60 p-3 text-left">
					<p className="text-xs font-medium uppercase tracking-wide text-neutral-500">
						Confirm {DECISION_REGISTRY[openAction].label.toLowerCase()}
					</p>
					<label className="flex items-center gap-2 text-sm text-neutral-300">
						<input
							type="checkbox"
							checked={sendEmail}
							onChange={(e) => setSendEmail(e.target.checked)}
							className="accent-emerald-500"
						/>
						Send email to submitter
					</label>
					{sendEmail ? (
						<div className="space-y-2">
							<label className="block text-xs text-neutral-400">
								Subject
								<input
									value={subject}
									onChange={(e) => setSubject(e.target.value)}
									className={`mt-1 w-full ${INPUT_CLASSES}`}
								/>
							</label>
							<label className="block text-xs text-neutral-400">
								Body
								<textarea
									value={text}
									onChange={(e) => setText(e.target.value)}
									rows={7}
									className={`mt-1 w-full ${INPUT_CLASSES} font-mono text-xs`}
								/>
							</label>
						</div>
					) : (
						<p className="text-xs text-neutral-500">
							The status changes without sending any email. You can email the
							submitter later.
						</p>
					)}
					{error ? <p className={noticeClasses("negative")}>{error}</p> : null}
					<div className="flex gap-2">
						<button
							type="button"
							disabled={pending || (sendEmail && (!subject.trim() || !text.trim()))}
							onClick={() => void confirm(openAction)}
							className={buttonClasses("primary", "sm")}
						>
							{pending
								? DECISION_REGISTRY[openAction].pendingLabel
								: sendEmail
									? `${DECISION_REGISTRY[openAction].label} + send email`
									: `${DECISION_REGISTRY[openAction].label} without email`}
						</button>
						<button
							type="button"
							disabled={pending}
							onClick={() => setOpenAction(null)}
							className={buttonClasses("secondary", "sm")}
						>
							Cancel
						</button>
					</div>
				</div>
			) : null}
		</div>
	);
}
