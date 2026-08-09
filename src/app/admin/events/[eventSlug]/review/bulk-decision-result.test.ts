import { describe, expect, it } from "vitest";
import { parseBulkDecisionResult } from "./bulk-decision-result";

describe("parseBulkDecisionResult", () => {
	it("keeps successful and failed 207 outcomes visible to the review workspace", () => {
		expect(parseBulkDecisionResult({
			ok: false,
			partial: true,
			succeeded: 1,
			failed: 1,
			outcomes: [
				{ submissionId: "proposal-ok", ok: true, status: "accepted" },
				{ submissionId: "proposal-retry", ok: false, status: 500, error: "materialization failed" },
			],
		})).toEqual({
			succeeded: 1,
			failed: 1,
			outcomes: [
				{ submissionId: "proposal-ok", ok: true, status: "accepted" },
				{ submissionId: "proposal-retry", ok: false, status: 500, error: "materialization failed" },
			],
			message: "1 updated; 1 needs attention — proposal-retry: materialization failed.",
		});
	});

	it("rejects malformed outcome payloads instead of treating them as a decision result", () => {
		expect(parseBulkDecisionResult({ succeeded: 1, failed: 0, outcomes: [{ submissionId: "missing-status", ok: true }] })).toBeNull();
	});
});
