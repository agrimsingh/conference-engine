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
	const [sendEmail, setSendEmail] = useState(true);
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
		setSendEmail(true);
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
					<fieldset className="space-y-2">
						<legend className="text-sm font-medium text-neutral-200">
							Email the submitter?
						</legend>
						<label className={`flex cursor-pointer items-start gap-2 rounded-md border px-3 py-2 text-sm ${sendEmail ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-100" : "border-neutral-800 text-neutral-300"}`}>
							<input
								type="radio"
								name={`decision-email-${submissionId}`}
								checked={sendEmail}
								onChange={() => setSendEmail(true)}
								className="mt-0.5 accent-emerald-500"
							/>
							<span>
								<span className="font-medium">Send email now</span>
								<span className="mt-0.5 block text-xs opacity-80">
									Recommended — they get the decision and portal link immediately.
								</span>
							</span>
						</label>
						<label className={`flex cursor-pointer items-start gap-2 rounded-md border px-3 py-2 text-sm ${!sendEmail ? "border-amber-500/40 bg-amber-500/10 text-amber-100" : "border-neutral-800 text-neutral-300"}`}>
							<input
								type="radio"
								name={`decision-email-${submissionId}`}
								checked={!sendEmail}
								onChange={() => setSendEmail(false)}
								className="mt-0.5 accent-amber-500"
							/>
							<span>
								<span className="font-medium">Change status only</span>
								<span className="mt-0.5 block text-xs opacity-80">
									No email. Find them later under Submissions → To notify.
								</span>
							</span>
						</label>
					</fieldset>
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
						<p className={noticeClasses("warning")}>
							Status updates without mail. Open the to-notify queue when you are ready
							to email.
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
