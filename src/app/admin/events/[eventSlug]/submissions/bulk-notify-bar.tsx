"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { buttonClasses, INPUT_CLASSES, noticeClasses } from "@/components/ui";

export type BulkNotifyRecipient = {
	id: string;
	title: string;
	speakers: string[];
};

type Props = {
	eventSlug: string;
	recipients: BulkNotifyRecipient[];
	defaultSubject: string;
	defaultText: string;
	mixedOutcomes: boolean;
};

const PREVIEW_LIMIT = 5;

export function BulkNotifyBar({
	eventSlug,
	recipients,
	defaultSubject,
	defaultText,
	mixedOutcomes,
}: Props) {
	const router = useRouter();
	const [open, setOpen] = useState(false);
	const [subject, setSubject] = useState(defaultSubject);
	const [text, setText] = useState(defaultText);
	const [pending, setPending] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const count = recipients.length;
	if (count === 0) return null;

	const submissionIds = recipients.map((recipient) => recipient.id);
	const previewRecipients = recipients.slice(0, PREVIEW_LIMIT);
	const overflow = count - previewRecipients.length;
	const canSend =
		!mixedOutcomes && subject.trim().length > 0 && text.trim().length > 0;

	async function notify() {
		if (!canSend) return;
		setPending(true);
		setError(null);
		try {
			const response = await fetch(
				`/api/admin/events/${eventSlug}/submissions/notify`,
				{
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({
						submissionIds,
						email: { send: true, subject, text },
					}),
				},
			);
			const data = (await response.json()) as { ok?: boolean; error?: string };
			if (!response.ok || data.ok === false) {
				setError(data.error ?? "Notify failed");
				return;
			}
			setOpen(false);
			router.refresh();
		} catch {
			setError("Network error");
		} finally {
			setPending(false);
		}
	}

	return (
		<div className="mb-4 rounded-md border border-amber-900/60 bg-amber-950/30 p-3">
			<div className="flex flex-wrap items-center justify-between gap-2">
				<p className="text-sm text-amber-100/90">
					{count} decided on this page. Speakers have not been informed yet.
				</p>
				<button
					type="button"
					className={buttonClasses("primary", "sm")}
					disabled={pending}
					onClick={() => {
						setError(null);
						setOpen(true);
					}}
				>
					Review and notify {count}
				</button>
			</div>

			{open ? (
				<div
					role="dialog"
					aria-modal="true"
					aria-labelledby="bulk-notify-title"
					className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
				>
					<div className="w-full max-w-lg space-y-3 rounded-lg border border-neutral-700 bg-neutral-900 p-4 shadow-xl">
						<h2
							id="bulk-notify-title"
							className="text-base font-medium text-neutral-100"
						>
							Review and notify {count}
						</h2>
						<p className="text-sm text-neutral-400">
							Speakers have not been informed yet. Edit the message, check who
							gets it, then send.
						</p>

						<ul className="max-h-36 space-y-1 overflow-y-auto rounded-md border border-neutral-800 bg-neutral-950/50 p-3 text-sm text-neutral-300">
							{previewRecipients.map((recipient) => {
								const speakerLabel =
									recipient.speakers.length > 0
										? recipient.speakers.join(", ")
										: "No speakers listed";
								return (
									<li key={recipient.id}>
										<span className="text-neutral-100">{recipient.title}</span>
										<span className="text-neutral-500"> · {speakerLabel}</span>
									</li>
								);
							})}
							{overflow > 0 ? (
								<li className="text-neutral-500">Plus {overflow} more</li>
							) : null}
						</ul>

						{mixedOutcomes ? (
							<p className={noticeClasses("warning")}>
								This page mixes accept, decline, and waitlist outcomes. Filter
								to one status, or open a submission to send its own message.
							</p>
						) : (
							<>
								<label className="block text-xs text-neutral-400">
									Subject
									<input
										value={subject}
										onChange={(event) => setSubject(event.target.value)}
										className={`mt-1 w-full ${INPUT_CLASSES}`}
									/>
								</label>
								<label className="block text-xs text-neutral-400">
									Body
									<textarea
										value={text}
										onChange={(event) => setText(event.target.value)}
										rows={6}
										className={`mt-1 w-full ${INPUT_CLASSES} font-mono text-xs`}
									/>
								</label>
								<p className="text-xs text-neutral-500">
									Uses this copy for every selected row. Open a submission to
									send a customized message.
								</p>
							</>
						)}

						{error ? <p className={noticeClasses("negative")}>{error}</p> : null}

						<div className="flex justify-end gap-2">
							<button
								type="button"
								disabled={pending}
								onClick={() => setOpen(false)}
								className={buttonClasses("secondary", "sm")}
							>
								Cancel
							</button>
							<button
								type="button"
								disabled={pending || !canSend}
								onClick={() => void notify()}
								className={buttonClasses("primary", "sm")}
							>
								{pending ? "Sending…" : `Send to ${count}`}
							</button>
						</div>
					</div>
				</div>
			) : null}
		</div>
	);
}
