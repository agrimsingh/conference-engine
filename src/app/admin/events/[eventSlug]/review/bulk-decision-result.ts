export type BulkDecisionOutcome =
	| { submissionId: string; ok: true; status: string }
	| { submissionId: string; ok: false; error: string; status: number };

export type BulkDecisionResult = {
	succeeded: number;
	failed: number;
	outcomes: BulkDecisionOutcome[];
	message: string;
};

/** Turns a 207 decision payload into UI-safe feedback, including the exact
 * selected submissions that need attention instead of a generic request error. */
export function parseBulkDecisionResult(value: unknown): BulkDecisionResult | null {
	if (!isRecord(value) || !Array.isArray(value.outcomes)) return null;
	const outcomes: BulkDecisionOutcome[] = [];
	for (const item of value.outcomes) {
		if (!isRecord(item) || typeof item.submissionId !== "string" || typeof item.ok !== "boolean") return null;
		if (item.ok) {
			if (typeof item.status !== "string") return null;
			outcomes.push({ submissionId: item.submissionId, ok: true, status: item.status });
		} else {
			if (typeof item.status !== "number" || typeof item.error !== "string") return null;
			outcomes.push({ submissionId: item.submissionId, ok: false, status: item.status, error: item.error });
		}
	}
	const succeeded = typeof value.succeeded === "number" ? value.succeeded : outcomes.filter((outcome) => outcome.ok).length;
	const failed = typeof value.failed === "number" ? value.failed : outcomes.filter((outcome) => !outcome.ok).length;
	if (!Number.isInteger(succeeded) || !Number.isInteger(failed) || succeeded < 0 || failed < 0 || succeeded + failed !== outcomes.length) return null;
	const failures = outcomes.filter((outcome): outcome is Extract<BulkDecisionOutcome, { ok: false }> => !outcome.ok);
	const detail = failures.slice(0, 3).map((outcome) => `${outcome.submissionId}: ${outcome.error}`).join("; ");
	const remaining = failures.length - 3;
	const message = failed === 0
		? `${succeeded} selected submission${succeeded === 1 ? "" : "s"} updated.`
		: `${succeeded} updated; ${failed} need${failed === 1 ? "s" : ""} attention${detail ? ` — ${detail}${remaining > 0 ? `; and ${remaining} more` : ""}` : ""}.`;
	return { succeeded, failed, outcomes, message };
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}
