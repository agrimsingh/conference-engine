import { addSubmissionLabel, getSubmissionById, removeSubmissionLabel } from "@/lib/db/queries";

const MAX_LABEL_LENGTH = 40;

export type BulkLabelAction = "add" | "remove";

export class BulkLabelValidationError extends Error {
	constructor(message: string, readonly status = 400) {
		super(message);
		this.name = "BulkLabelValidationError";
	}
}

export function normalizeSubmissionLabel(raw: unknown): string | null {
	if (typeof raw !== "string") return null;
	const normalized = raw.trim().replace(/\s+/g, " ");
	if (!normalized || normalized.length > MAX_LABEL_LENGTH) return null;
	return normalized;
}

export async function bulkLabelSubmissions(
	db: D1Database,
	args: { eventId: string; submissionIds: string[]; label: string; action: BulkLabelAction },
): Promise<{ submissionIds: string[]; label: string; action: BulkLabelAction }> {
	if (args.action !== "add" && args.action !== "remove") {
		throw new BulkLabelValidationError("action must be add or remove");
	}
	const label = normalizeSubmissionLabel(args.label);
	if (!label) {
		throw new BulkLabelValidationError(`Label must be 1–${MAX_LABEL_LENGTH} characters`);
	}
	const submissionIds = [...new Set(args.submissionIds.map((id) => id.trim()).filter(Boolean))];
	if (!submissionIds.length || submissionIds.length !== args.submissionIds.length) {
		throw new BulkLabelValidationError("Select unique submissions to label");
	}
	const submissions = await Promise.all(submissionIds.map((submissionId) => getSubmissionById(db, submissionId)));
	if (submissions.some((submission) => !submission || submission.event_id !== args.eventId)) {
		throw new BulkLabelValidationError("One or more submissions do not belong to this event", 404);
	}
	for (const submissionId of submissionIds) {
		if (args.action === "add") await addSubmissionLabel(db, submissionId, label);
		else await removeSubmissionLabel(db, submissionId, label);
	}
	return { submissionIds, label, action: args.action };
}
