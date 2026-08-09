"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { buttonClasses, INPUT_CLASSES, noticeClasses } from "@/components/ui";

type Props = {
	eventSlug: string;
	submissionIds: string[];
	defaultSubject: string;
	defaultText: string;
};

export function BulkNotifyBar({
	eventSlug,
	submissionIds,
	defaultSubject,
	defaultText,
}: Props) {
	const router = useRouter();
	const [open, setOpen] = useState(false);
	const [subject, setSubject] = useState(defaultSubject);
	const [text, setText] = useState(defaultText);
	const [pending, setPending] = useState(false);
	const [error, setError] = useState<string | null>(null);

	if (submissionIds.length === 0) return null;

	async function notify() {
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
					{submissionIds.length} decided on this page, not yet notified.
				</p>
				<button
					type="button"
					className={buttonClasses("primary", "sm")}
					disabled={pending}
					onClick={() => setOpen((value) => !value)}
				>
					{open ? "Hide notify" : "Notify later → send now"}
				</button>
			</div>
			{open ? (
				<div className="mt-3 space-y-2">
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
						Uses this copy for every selected row. Re-open a submission to send a
						customized message.
					</p>
					{error ? <p className={noticeClasses("negative")}>{error}</p> : null}
					<button
						type="button"
						disabled={pending || !subject.trim() || !text.trim()}
						onClick={() => void notify()}
						className={buttonClasses("primary", "sm")}
					>
						{pending ? "Sending…" : `Send to ${submissionIds.length}`}
					</button>
				</div>
			) : null}
		</div>
	);
}
