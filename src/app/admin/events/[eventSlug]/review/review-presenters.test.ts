import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { formatReviewPresenters, ReviewPresenters } from "./review-presenters";

describe("formatReviewPresenters", () => {
	it("retains positions and labels a primary speaker with subsequent co-authors", () => {
		// Given
		const speakers = [
			{ name: "Ada Lovelace", email: "ada@example.test", status: "confirmed", position: 0 },
			{ name: "Grace Hopper", email: "grace@example.test", status: "pending", position: 1 },
			{ name: "Margaret Hamilton", email: "margaret@example.test", status: "confirmed", position: 2 },
		];

		// When
		const presenters = formatReviewPresenters(speakers);

		// Then
		expect(presenters).toEqual([
			{ ...speakers[0], role: "Primary speaker" },
			{ ...speakers[1], role: "Co-author" },
			{ ...speakers[2], role: "Co-author" },
		]);
	});

	it("renders each retained position as an organizer-visible role label", () => {
		// Given
		const speakers = [
			{ name: "Ada Lovelace", email: "ada@example.test", status: "confirmed", position: 0 },
			{ name: "Grace Hopper", email: "grace@example.test", status: "pending", position: 1 },
		];

		// When
		const html = renderToStaticMarkup(createElement(ReviewPresenters, { speakers }));

		// Then
		expect(html).toContain("Primary speaker:");
		expect(html).toContain("Co-author:");
	});
});
