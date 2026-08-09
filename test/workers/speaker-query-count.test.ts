import { env } from "cloudflare:workers";
import { describe, expect, it, vi } from "vitest";
import { listSpeakersForSubmissions } from "@/lib/db/queries";

describe("speaker bulk query", () => {
	it("Given 101 unique submissions, when speakers are loaded, then D1 receives two bounded bulk queries", async () => {
		const submissionIds = Array.from(
			{ length: 101 },
			(_, index) => `speaker-query-count-${index}`,
		);
		const prepare = vi.spyOn(env.DB, "prepare");

		try {
			const speakers = await listSpeakersForSubmissions(env.DB, submissionIds);
			const speakerQueries = prepare.mock.calls.filter(([query]) =>
				query.includes("FROM submission_speakers"),
			);

			expect(speakers).toEqual(new Map());
			expect(speakerQueries).toHaveLength(2);
			expect(speakerQueries.every(([query]) => query.includes("IN ("))).toBe(true);
		} finally {
			prepare.mockRestore();
		}
	});
});
