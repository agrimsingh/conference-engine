import { describe, expect, it } from "vitest";
import {
	isReviewBoardSubmissionStatus,
	isReviewableSubmissionStatus,
	REVIEW_BOARD_STATUS_SQL,
} from "./evaluation";

describe("review board statuses", () => {
	it("keeps scheduled and published talks on the board after they leave the CFP queue", () => {
		expect(isReviewableSubmissionStatus("published")).toBe(false);
		expect(isReviewBoardSubmissionStatus("published")).toBe(true);
		expect(isReviewBoardSubmissionStatus("scheduled")).toBe(true);
		expect(isReviewBoardSubmissionStatus("withdrawn")).toBe(false);
		expect(REVIEW_BOARD_STATUS_SQL).toContain("'published'");
		expect(REVIEW_BOARD_STATUS_SQL).toContain("'scheduled'");
	});
});
