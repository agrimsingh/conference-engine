import { getDb } from "@/lib/db/cloudflare";
import { getEventById, getSubmissionById } from "@/lib/db/queries";
import { getSpeakerByConfirmToken, listCoSpeakerInviteHistory } from "@/lib/speakers/co-speakers";
import { titleFromAnswersJson } from "@/lib/email/notify";
import { coSpeakerStatusTone, EmptyState, StatusPill } from "@/components/ui";
import { RespondButtons } from "./respond-buttons";

type Props = {
	params: Promise<{ token: string }>;
	searchParams: Promise<{ intent?: string }>;
};

export default async function CoSpeakerRespondPage({ params, searchParams }: Props) {
	const { token } = await params;
	const { intent } = await searchParams;

	const db = await getDb();
	const speaker = await getSpeakerByConfirmToken(db, token);

	if (!speaker) {
		return (
			<main className="mx-auto max-w-lg px-4 py-16">
				<EmptyState
					title="This link is no longer valid"
					description="Your invite may have been reissued. Ask the organizers to resend it — your co-speaker spot is not lost."
				/>
			</main>
		);
	}

	const [submission, history] = await Promise.all([
		getSubmissionById(db, speaker.submission_id),
		listCoSpeakerInviteHistory(db, speaker.id),
	]);
	const event = submission ? await getEventById(db, submission.event_id) : null;
	const title = submission
		? titleFromAnswersJson(submission.answers_json)
		: "(unknown talk)";

	return (
		<main className="mx-auto max-w-lg px-4 py-16">
			<div className="rounded-lg border border-neutral-800 bg-neutral-900 p-6">
				<p className="text-xs font-medium uppercase tracking-wide text-neutral-500">
					Co-speaker invitation
				</p>
				<h1 className="mt-2 text-balance text-2xl font-semibold tracking-tight text-neutral-100">
					{title}
				</h1>
				<p className="mt-1 text-sm text-neutral-400">
					{event ? event.name : "conference-engine"}
				</p>
				<div className="mt-4 flex items-center gap-2 text-sm text-neutral-300">
					<span>
						{speaker.name} · {speaker.email}
					</span>
					<StatusPill tone={coSpeakerStatusTone(speaker.status)}>
						{speaker.status}
					</StatusPill>
				</div>

				{speaker.status === "pending" ? (
					<>
						<p className="mt-4 text-sm text-neutral-400">
							You were listed as a co-speaker on this proposal. Confirming only
							tells the organizers you&apos;re on board — it does not promise
							tickets, travel, or acceptance.
						</p>
						<div className="mt-5">
							<RespondButtons
								token={token}
								defaultIntent={intent === "decline" ? "decline" : "confirm"}
							/>
						</div>
					</>
				) : (
					<p className="mt-4 text-sm text-neutral-400">
						{speaker.status === "confirmed"
							? "You've confirmed your participation. Nothing else is needed right now."
							: speaker.status === "declined"
								? "You've declined this invitation. If that was a mistake, ask the submitter or organizers to resend your invite."
								: "This listing was removed by the organizers."}
					</p>
				)}
				{history.length > 0 ? (
					<div className="mt-5 border-t border-neutral-800 pt-4">
						<p className="text-xs font-medium uppercase tracking-wide text-neutral-500">Invitation history</p>
						<ul className="mt-2 space-y-1 text-xs text-neutral-400">
							{history.map((invite) => <li key={invite.delivery_key}>Invite {invite.generation} · {invite.status ?? "pending"}{invite.error ? ` · ${invite.error}` : ""}</li>)}
						</ul>
					</div>
				) : null}
			</div>
		</main>
	);
}
