import Link from "next/link";
import { notFound } from "next/navigation";
import { isAdminBypass } from "@/lib/auth/admin";
import { getDb } from "@/lib/db/cloudflare";
import {
	getActiveEvaluationPlan,
	getEvaluationPlanByToken,
	getEventById,
	getEventBySlug,
	listEvaluationScoresForPlan,
	listReviewableSubmissions,
} from "@/lib/db/queries";
import { ReviewBoard } from "./review-board";

type Props = {
	searchParams: Promise<{ token?: string; event?: string }>;
};

export default async function ReviewPage({ searchParams }: Props) {
	const params = await searchParams;
	const db = await getDb();
	const admin = await isAdminBypass();

	let plan = params.token
		? await getEvaluationPlanByToken(db, params.token)
		: null;

	if (!plan && admin && params.event) {
		const event = await getEventBySlug(db, params.event);
		if (event) {
			plan = await getActiveEvaluationPlan(db, event.id);
		}
	}

	if (!plan) {
		return (
			<main className="mx-auto min-h-screen max-w-3xl px-4 py-10 text-neutral-900">
				<h1 className="text-2xl font-semibold">Review</h1>
				<p className="mt-2 text-sm text-neutral-600">
					Provide a reviewer <code className="text-xs">?token=</code> or activate a
					plan as admin, then open{" "}
					<code className="text-xs">/review?event=aie-sandbox</code> with the bypass
					cookie.
				</p>
				{admin ? (
					<p className="mt-4 text-sm">
						Admin:{" "}
						<Link className="underline" href="/admin/events/aie-sandbox/submissions">
							submissions
						</Link>
					</p>
				) : null}
			</main>
		);
	}

	const event = await getEventById(db, plan.event_id);
	if (!event) notFound();

	const submissions = await listReviewableSubmissions(db, event.id);
	const scores = await listEvaluationScoresForPlan(db, plan.id);
	const scoresBySubmission = new Map<string, typeof scores>();
	for (const score of scores) {
		const list = scoresBySubmission.get(score.submission_id) ?? [];
		list.push(score);
		scoresBySubmission.set(score.submission_id, list);
	}

	const rows = submissions.map((row) => {
		let title = "(untitled)";
		try {
			const answers: unknown = JSON.parse(row.answers_json);
			if (
				typeof answers === "object" &&
				answers !== null &&
				"title" in answers &&
				typeof (answers as { title: unknown }).title === "string"
			) {
				title = (answers as { title: string }).title;
			}
		} catch {
			// ignore
		}
		return {
			id: row.id,
			status: row.status,
			submitterName: row.submitter_name,
			submitterEmail: row.submitter_email,
			title,
			scores: (scoresBySubmission.get(row.id) ?? []).map((s) => ({
				id: s.id,
				score: s.score,
				comment: s.comment,
				scoredBy: s.scored_by,
			})),
		};
	});

	return (
		<main className="mx-auto min-h-screen max-w-3xl px-4 py-10 text-neutral-900">
			<header className="mb-8 space-y-2 border-b border-neutral-200 pb-4">
				<p className="text-xs uppercase tracking-wide text-neutral-500">
					Evaluation · {plan.name} · {plan.status}
				</p>
				<h1 className="text-3xl font-semibold tracking-tight">{event.name}</h1>
				<p className="text-sm text-neutral-600">
					Score 1–5. Organizer accept/reject requires admin bypass.
				</p>
			</header>

			<ReviewBoard
				eventSlug={event.slug}
				token={plan.reviewer_token}
				canDecide={admin}
				submissions={rows}
			/>
		</main>
	);
}
