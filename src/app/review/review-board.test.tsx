import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
	useRouter: () => ({ refresh: vi.fn() }),
}));

import { ReviewBoard } from "./review-board";

const submission = {
	id: "submission-1",
	status: "under_review",
	submitterName: null,
	submitterEmail: null,
	title: "Reviewable proposal",
	category: "Talk",
	format: null,
	assignment: "Assigned to you",
	recusedAt: null,
	answers: [],
	previews: {
		accept: { subject: "Accepted", text: "Accepted" },
		waitlist: { subject: "Waitlisted", text: "Waitlisted" },
		reject: { subject: "Rejected", text: "Rejected" },
	},
	scores: [],
	criterionScores: [],
};

describe("ReviewBoard", () => {
	it("does not render decision controls for a reviewer identity even when organizer bypass is present", () => {
		// Given
		const board = <ReviewBoard eventSlug="event" token="reviewer-token" canDecide reviewerId="reviewer-1" criteria={[]} submissions={[submission]} />;

		// When
		const html = renderToStaticMarkup(board);

		// Then
		expect(html).not.toContain(">Accept<");
		expect(html).not.toContain(">Reject<");
	});

	it("renders decision controls for an organizer committee identity", () => {
		// Given
		const board = <ReviewBoard eventSlug="event" token="committee-token" canDecide reviewerId={null} criteria={[]} submissions={[submission]} />;

		// When
		const html = renderToStaticMarkup(board);

		// Then
		expect(html).toContain(">Accept<");
		expect(html).toContain(">Reject<");
	});
});
