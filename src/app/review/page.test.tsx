import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DecisionAction, RenderedMessage } from "@/lib/domain";

type CapturedSubmission = {
	readonly previews?: Record<DecisionAction, RenderedMessage>;
};

type CapturedReviewBoardProps = {
	readonly canDecide: boolean;
	readonly submissions: readonly CapturedSubmission[];
};

const mocks = vi.hoisted(() => ({
	isAdminBypass: vi.fn(),
	getDb: vi.fn(),
	getCloudflareEnv: vi.fn(),
	resolveReviewIdentity: vi.fn(),
	getEventById: vi.fn(),
	listReviewableSubmissions: vi.fn(),
	listEvaluationScoresForPlan: vi.fn(),
	listReviewerAssignments: vi.fn(),
	listCriteria: vi.fn(),
	listCriterionScoresForPlan: vi.fn(),
	listEventMessageTemplates: vi.fn(),
	fieldLabelsForSubmissions: vi.fn(),
	reviewBoard: vi.fn<(props: CapturedReviewBoardProps) => void>(),
}));

vi.mock("next/navigation", () => ({ notFound: vi.fn() }));
vi.mock("@/lib/auth/admin", () => ({ isAdminBypass: mocks.isAdminBypass }));
vi.mock("@/lib/db/cloudflare", () => ({
	getDb: mocks.getDb,
	getCloudflareEnv: mocks.getCloudflareEnv,
}));
vi.mock("@/lib/db/queries", () => ({
	getEventById: mocks.getEventById,
	getEventBySlug: vi.fn(),
	getActiveEvaluationPlan: vi.fn(),
	listEvaluationScoresForPlan: mocks.listEvaluationScoresForPlan,
	listReviewableSubmissions: mocks.listReviewableSubmissions,
}));
vi.mock("@/lib/evaluation/assignments", async (loadOriginal) => {
	const original = await loadOriginal<typeof import("@/lib/evaluation/assignments")>();
	return {
		...original,
		listReviewerAssignments: mocks.listReviewerAssignments,
	};
});
vi.mock("@/lib/evaluation/score", () => ({
	resolveReviewIdentity: mocks.resolveReviewIdentity,
	listCriterionScoresForPlan: mocks.listCriterionScoresForPlan,
}));
vi.mock("@/lib/evaluation/plan", () => ({ listCriteria: mocks.listCriteria }));
vi.mock("@/lib/email/templates", async (loadOriginal) => {
	const original = await loadOriginal<typeof import("@/lib/email/templates")>();
	return {
		...original,
		listEventMessageTemplates: mocks.listEventMessageTemplates,
	};
});
vi.mock("@/lib/cfp/form-revisions", () => ({
	fieldLabelsForSubmissions: mocks.fieldLabelsForSubmissions,
}));
vi.mock("./review-board", () => ({
	ReviewBoard: (props: CapturedReviewBoardProps) => {
		mocks.reviewBoard(props);
		return null;
	},
}));

import ReviewPage from "./page";

const plan = {
	id: "plan-1",
	event_id: "event-1",
	name: "Blind review",
	status: "active" as const,
	reviewer_token: "committee-token",
	created_at: 1,
	updated_at: 1,
	open_at: null,
	close_at: null,
	blind_review: 1,
	assignment_cap: null,
};

const reviewer = {
	id: "reviewer-1",
	plan_id: plan.id,
	name: "Sam Reviewer",
	email: "sam@example.test",
	token: "reviewer-token",
	created_at: 1,
};

const submission = {
	id: "submission-1",
	form_id: "form-1",
	event_id: "event-1",
	status: "under_review",
	answers_json: JSON.stringify({
		title: "Identity-safe proposal",
		abstract: "A technical abstract",
		company: "Identity Corp",
		coAuthorName: "Coauthor Secret",
	}),
	category: "Talk",
	submitter_email: "author-secret@example.test",
	submitter_name: "Author Secret",
	submitter_person_id: "person-1",
	created_at: 1,
	updated_at: 1,
	submitted_at: 1,
};

async function renderReviewPage(token: string): Promise<CapturedReviewBoardProps> {
	const page = await ReviewPage({ searchParams: Promise.resolve({ token }) });
	renderToStaticMarkup(page);
	const call = mocks.reviewBoard.mock.calls.at(-1);
	const props = call?.[0];
	if (!props) throw new TypeError("Expected ReviewBoard to receive review page props");
	return props;
}

describe("ReviewPage client payload", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.isAdminBypass.mockResolvedValue(true);
		mocks.getDb.mockResolvedValue({ marker: "db" });
		mocks.getCloudflareEnv.mockResolvedValue({ APP_ORIGIN: "https://conference.example.test" });
		mocks.getEventById.mockResolvedValue({
			id: "event-1",
			slug: "event-one",
			name: "Event One",
			timezone: "UTC",
			start_day: null,
			end_day: null,
			created_at: 1,
			updated_at: 1,
		});
		mocks.listReviewableSubmissions.mockResolvedValue([submission]);
		mocks.listEvaluationScoresForPlan.mockResolvedValue([]);
		mocks.listReviewerAssignments.mockResolvedValue([
			{
				id: "assignment-1",
				plan_id: plan.id,
				reviewer_id: reviewer.id,
				submission_id: submission.id,
				created_at: 1,
				recused_at: null,
			},
		]);
		mocks.listCriteria.mockResolvedValue([]);
		mocks.listCriterionScoresForPlan.mockResolvedValue([]);
		mocks.listEventMessageTemplates.mockResolvedValue([]);
		mocks.fieldLabelsForSubmissions.mockResolvedValue(new Map());
	});

	it("omits decision previews and author identity from a blind reviewer payload even with organizer bypass", async () => {
		// Given
		mocks.resolveReviewIdentity.mockResolvedValue({ mode: "reviewer", plan, reviewer });

		// When
		const props = await renderReviewPage("reviewer-token");
		const serialized = JSON.stringify(props);
		const row = props.submissions[0];
		if (!row) throw new TypeError("Expected a reviewer submission");

		// Then
		expect(props.canDecide).toBe(false);
		expect(row).not.toHaveProperty("previews");
		expect(serialized).not.toContain("Author Secret");
		expect(serialized).not.toContain("author-secret@example.test");
		expect(serialized).not.toContain("Identity Corp");
		expect(serialized).not.toContain("Coauthor Secret");
	});

	it("omits decision previews from a non-blind reviewer payload", async () => {
		// Given
		mocks.resolveReviewIdentity.mockResolvedValue({
			mode: "reviewer",
			plan: { ...plan, blind_review: 0 },
			reviewer,
		});

		// When
		const props = await renderReviewPage("reviewer-token");
		const row = props.submissions[0];
		if (!row) throw new TypeError("Expected a reviewer submission");

		// Then
		expect(props.canDecide).toBe(false);
		expect(row).not.toHaveProperty("previews");
	});

	it("keeps decision previews in the organizer committee payload", async () => {
		// Given
		mocks.resolveReviewIdentity.mockResolvedValue({ mode: "committee", plan, reviewer: null });

		// When
		const props = await renderReviewPage("committee-token");
		const row = props.submissions[0];
		if (!row) throw new TypeError("Expected a committee submission");

		// Then
		expect(props.canDecide).toBe(true);
		expect(row).toHaveProperty("previews");
	});
});
