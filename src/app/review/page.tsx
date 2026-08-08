import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { isAdminBypass } from "@/lib/auth/admin";
import { getDb } from "@/lib/db/cloudflare";
import {
	getActiveEvaluationPlan,
	getEventById,
	getEventBySlug,
	listEvaluationScoresForPlan,
	listReviewableSubmissions,
} from "@/lib/db/queries";
import { renderDecisionPreviews } from "@/lib/domain";
import { displayCategory } from "@/lib/domain";
import {
	filterBoardSubmissions,
	listReviewerAssignments,
} from "@/lib/evaluation/assignments";
import { resolveReviewIdentity } from "@/lib/evaluation/score";
import { ReviewBoard } from "./review-board";

type Props = {
	searchParams: Promise<{ token?: string; event?: string }>;
};

export default async function ReviewPage({ searchParams }: Props) {
	const params = await searchParams;
	const db = await getDb();
	const admin = await isAdminBypass();

	let identity = params.token
		? await resolveReviewIdentity(db, params.token)
		: null;
	let accessToken = params.token?.trim() || "";

	if (!identity && admin && params.event) {
		const event = await getEventBySlug(db, params.event);
		if (event) {
			const plan = await getActiveEvaluationPlan(db, event.id);
			if (plan) {
				identity = { mode: "committee", plan, reviewer: null };
				accessToken = plan.reviewer_token;
			}
		}
	}

	if (!identity) {
		return (
			<main className="mx-auto max-w-3xl px-4 py-10">
				<PageHeader
					eyebrow="Review"
					title="Open your review link"
					description="Use the personal link from your invite email, or ask an organizer to activate the evaluation plan and share the board URL."
				/>
				{admin ? (
					<p className="text-sm text-neutral-400">
						As organizer: activate a plan from{" "}
						<Link
							className="font-medium text-neutral-200 underline underline-offset-2"
							href="/admin/events/aie-sandbox/submissions"
						>
							Submissions
						</Link>
						, then reopen this page with{" "}
						<code className="rounded-md bg-neutral-900 px-1.5 py-0.5 text-xs text-neutral-300">
							?event=aie-sandbox
						</code>
						.
					</p>
				) : (
					<p className="text-sm text-neutral-400">
						Missing or invalid token.{" "}
						<Link
							className="text-neutral-200 underline underline-offset-2"
							href="/"
						>
							Back home
						</Link>
					</p>
				)}
			</main>
		);
	}

	const { plan } = identity;
	const event = await getEventById(db, plan.event_id);
	if (!event) notFound();

	const reviewable = await listReviewableSubmissions(db, event.id);
	const reviewerAssignments =
		identity.mode === "reviewer"
			? await listReviewerAssignments(db, {
					planId: plan.id,
					reviewerId: identity.reviewer.id,
				})
			: [];
	const submissions = filterBoardSubmissions(reviewable, {
		mode: identity.mode,
		assignments: reviewerAssignments,
	});
	const scores = await listEvaluationScoresForPlan(db, plan.id);
	const scoresBySubmission = new Map<string, typeof scores>();
	for (const score of scores) {
		const list = scoresBySubmission.get(score.submission_id) ?? [];
		list.push(score);
		scoresBySubmission.set(score.submission_id, list);
	}

	const rows = submissions.map((row) => {
		let title = "(untitled)";
		let parsedAnswers: Record<string, unknown> = {};
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
			if (typeof answers === "object" && answers !== null && !Array.isArray(answers)) parsedAnswers = answers as Record<string, unknown>;
		} catch {
			// ignore
		}
		return {
			id: row.id,
			status: row.status,
			submitterName: row.submitter_name,
			submitterEmail: row.submitter_email,
			title,
			category: displayCategory(row.category),
			format: typeof parsedAnswers.format === "string" ? parsedAnswers.format : null,
			assignment: identity.mode === "reviewer" ? "Assigned to you" : "Committee review",
			answers: Object.entries(parsedAnswers)
				.filter(([key]) => key !== "speakers")
				.map(([key, value]) => ({ label: key.replaceAll("_", " "), value: Array.isArray(value) ? value.join(", ") : typeof value === "string" || typeof value === "number" ? String(value) : JSON.stringify(value) }))
				.filter((answer) => answer.value && answer.value !== "{}"),
			previews: renderDecisionPreviews({
				eventName: event.name,
				submitterName: row.submitter_name ?? "there",
				title,
			}),
			scores: (scoresBySubmission.get(row.id) ?? []).map((s) => ({
				id: s.id,
				score: s.score,
				comment: s.comment,
				scoredBy: s.scored_by,
			})),
		};
	});

	const reviewingAs =
		identity.mode === "reviewer" ? identity.reviewer.name : "committee";

	return (
		<main className="mx-auto max-w-3xl px-4 py-10">
			<header className="mb-8 space-y-3 border-b border-neutral-800 pb-5">
				<p className="text-xs font-medium uppercase tracking-wide text-neutral-500">
					Review · {plan.name}
				</p>
				<h1 className="text-balance text-3xl font-semibold tracking-tight text-neutral-100">
					{event.name}
				</h1>
				<p className="rounded-md border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm font-medium text-neutral-100">
					Reviewing as {reviewingAs}
				</p>
				<p className="text-pretty text-sm text-neutral-400">
					Tap 1–5 to score. Optional comment, then save. Organizers can accept or
					reject from here when signed in.
				</p>
			</header>

			<ReviewBoard
				eventSlug={event.slug}
				token={accessToken}
				canDecide={admin}
				submissions={rows}
			/>
		</main>
	);
}
