import { getDb } from "@/lib/db/cloudflare";
import { getEventById, getPersonById, getSubmissionById } from "@/lib/db/queries";
import { titleFromAnswersJson } from "@/lib/email/notify";
import { getHandoffByToken } from "@/lib/speakers/handoff";
import { EmptyState, StatusPill } from "@/components/ui";
import { HandoffRespondButtons } from "./respond-buttons";

type Props = {
	params: Promise<{ token: string }>;
	searchParams: Promise<{ intent?: string }>;
};

export default async function SpeakerHandoffPage({ params, searchParams }: Props) {
	const { token } = await params;
	const { intent } = await searchParams;
	const db = await getDb();
	const handoff = await getHandoffByToken(db, decodeURIComponent(token));

	if (!handoff) {
		return (
			<main className="mx-auto max-w-lg px-4 py-16">
				<EmptyState
					title="This link is no longer valid"
					description="Ask the speaker to send a new handoff from the speaker portal."
				/>
			</main>
		);
	}

	const [submission, speaker] = await Promise.all([
		getSubmissionById(db, handoff.submission_id),
		getPersonById(db, handoff.speaker_person_id),
	]);
	const event = submission ? await getEventById(db, submission.event_id) : null;
	const title = submission ? titleFromAnswersJson(submission.answers_json) : "(unknown talk)";

	return (
		<main className="mx-auto max-w-lg px-4 py-16">
			<div className="rounded-lg border border-neutral-800 bg-neutral-900 p-6">
				<p className="text-xs font-medium uppercase tracking-wide text-neutral-500">
					Speaker handoff
				</p>
				<h1 className="mt-2 text-balance text-2xl font-semibold tracking-tight text-neutral-100">
					{title}
				</h1>
				<p className="mt-1 text-sm text-neutral-400">{event ? event.name : "conference-engine"}</p>
				<div className="mt-4 flex items-center gap-2 text-sm text-neutral-300">
					<span>
						{speaker?.name || speaker?.email || "Speaker"} asked {handoff.manager_email} to manage this session
					</span>
					<StatusPill tone={handoff.status === "accepted" ? "positive" : handoff.status === "pending" ? "warning" : "neutral"}>
						{handoff.status}
					</StatusPill>
				</div>
				{handoff.status === "pending" ? (
					<>
						<p className="mt-4 text-sm text-neutral-400">
							Accepting lets you complete portal tasks and confirm schedule changes. You will not be listed as a public speaker.
						</p>
						<div className="mt-5">
							<HandoffRespondButtons
								token={decodeURIComponent(token)}
								defaultIntent={intent === "decline" ? "decline" : "accept"}
							/>
						</div>
					</>
				) : (
					<p className="mt-4 text-sm text-neutral-400">
						{handoff.status === "accepted"
							? "You've accepted this handoff. Sign in to the speaker portal with this email to manage the session."
							: handoff.status === "declined"
								? "You've declined this handoff."
								: "This handoff was cancelled."}
					</p>
				)}
			</div>
		</main>
	);
}
