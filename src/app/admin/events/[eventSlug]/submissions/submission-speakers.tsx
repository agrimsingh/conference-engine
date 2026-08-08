"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { coSpeakerStatusTone, StatusPill } from "@/components/ui";
import type { CoSpeakerStatus } from "@/lib/domain";

export type SpeakerSummary = {
	id: string;
	name: string;
	email: string;
	position: number;
	status: CoSpeakerStatus;
	addedAfterAcceptance: boolean;
};

type Props = {
	eventSlug: string;
	submissionId: string;
	speakers: SpeakerSummary[];
};

type SpeakerActionBody =
	| { action: "add"; name: string; email: string }
	| { action: "confirm" | "remove" | "resend"; speakerId: string };

export function SubmissionSpeakers({ eventSlug, submissionId, speakers }: Props) {
	const router = useRouter();
	const [adding, setAdding] = useState(false);
	const [draftName, setDraftName] = useState("");
	const [draftEmail, setDraftEmail] = useState("");
	const [pending, setPending] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [notice, setNotice] = useState<string | null>(null);

	async function mutate(body: SpeakerActionBody) {
		setPending(true);
		setError(null);
		setNotice(null);
		try {
			const response = await fetch(
				`/api/admin/events/${eventSlug}/submissions/${submissionId}/speakers`,
				{
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify(body),
				},
			);
			const data = (await response.json()) as {
				ok?: boolean;
				error?: string;
				confirmUrl?: string | null;
				emailStatus?: string;
			};
			if (!response.ok || !data.ok) {
				setError(data.error ?? "Speaker update failed");
				return;
			}
			if (body.action === "resend" || body.action === "add") {
				setNotice(
					data.emailStatus === "sent"
						? "Invite email sent."
						: data.confirmUrl
							? `Email not sent (${data.emailStatus}); share the link manually: ${data.confirmUrl}`
							: "Invite prepared.",
				);
			}
			setDraftName("");
			setDraftEmail("");
			setAdding(false);
			router.refresh();
		} catch {
			setError("Network error");
		} finally {
			setPending(false);
		}
	}

	const visible = speakers.filter((speaker) => speaker.status !== "removed");

	return (
		<div className="space-y-1.5">
			<div className="flex flex-wrap items-center gap-1.5">
				<span className="text-xs font-medium uppercase tracking-wide text-neutral-500">
					Speakers
				</span>
				{visible.map((speaker) => (
					<span
						key={speaker.id}
						className="inline-flex items-center gap-1.5 rounded-md border border-neutral-700 bg-neutral-900 px-2 py-0.5 text-xs text-neutral-300"
					>
						{speaker.name || speaker.email}
						<StatusPill tone={coSpeakerStatusTone(speaker.status)}>
							{speaker.status}
						</StatusPill>
						{speaker.addedAfterAcceptance ? (
							<span
								title="Added after acceptance — verify before comping tickets"
								className="rounded-full border border-amber-500/30 bg-amber-500/10 px-1.5 text-[10px] font-medium uppercase tracking-wide text-amber-400"
							>
								added late
							</span>
						) : null}
						{speaker.position !== 0 ? (
							<span className="inline-flex items-center gap-1">
								{speaker.status === "pending" || speaker.status === "declined" ? (
									<button
										type="button"
										disabled={pending}
										onClick={() =>
											void mutate({ action: "resend", speakerId: speaker.id })
										}
										className="text-neutral-500 underline underline-offset-2 hover:text-neutral-200 disabled:opacity-40"
									>
										resend
									</button>
								) : null}
								{speaker.status === "pending" ? (
									<button
										type="button"
										disabled={pending}
										onClick={() =>
											void mutate({ action: "confirm", speakerId: speaker.id })
										}
										className="text-neutral-500 underline underline-offset-2 hover:text-neutral-200 disabled:opacity-40"
									>
										confirm
									</button>
								) : null}
								<button
									type="button"
									disabled={pending}
									onClick={() =>
										void mutate({ action: "remove", speakerId: speaker.id })
									}
									aria-label={`Remove co-speaker ${speaker.name || speaker.email}`}
									className="text-neutral-500 hover:text-neutral-200 disabled:opacity-40"
								>
									×
								</button>
							</span>
						) : null}
					</span>
				))}
				{adding ? (
					<form
						className="inline-flex flex-wrap items-center gap-1"
						onSubmit={(event) => {
							event.preventDefault();
							if (draftName.trim() && draftEmail.trim()) {
								void mutate({
									action: "add",
									name: draftName,
									email: draftEmail,
								});
							}
						}}
					>
						<input
							autoFocus
							value={draftName}
							onChange={(e) => setDraftName(e.target.value)}
							placeholder="name"
							className="w-28 rounded-md border border-neutral-700 bg-neutral-900 px-2 py-0.5 text-xs text-neutral-100 placeholder:text-neutral-500"
							disabled={pending}
						/>
						<input
							type="email"
							value={draftEmail}
							onChange={(e) => setDraftEmail(e.target.value)}
							onKeyDown={(e) => {
								if (e.key === "Escape") {
									setAdding(false);
									setDraftName("");
									setDraftEmail("");
								}
							}}
							placeholder="email"
							className="w-40 rounded-md border border-neutral-700 bg-neutral-900 px-2 py-0.5 text-xs text-neutral-100 placeholder:text-neutral-500"
							disabled={pending}
						/>
						<button
							type="submit"
							disabled={pending || !draftName.trim() || !draftEmail.trim()}
							className="rounded-md border border-neutral-700 bg-neutral-900 px-1.5 py-0.5 text-xs text-neutral-300 hover:bg-neutral-800 disabled:opacity-40"
						>
							{pending ? "…" : "Invite"}
						</button>
					</form>
				) : (
					<button
						type="button"
						onClick={() => setAdding(true)}
						className="rounded-md border border-dashed border-neutral-700 px-2 py-0.5 text-xs text-neutral-500 hover:border-neutral-500 hover:text-neutral-300"
					>
						+ co-speaker
					</button>
				)}
			</div>
			{error ? <p className="text-xs text-red-400">{error}</p> : null}
			{notice ? <p className="break-all text-xs text-neutral-400">{notice}</p> : null}
		</div>
	);
}
