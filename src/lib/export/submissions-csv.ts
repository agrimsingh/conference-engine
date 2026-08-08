import {
	getEventBySlug,
	listLabelsForEvent,
	listSpeakersForSubmission,
	listSubmissionsForEvent,
} from "@/lib/db/queries";
import { displayCategory, titleFromAnswers } from "@/lib/domain";

export const SUBMISSION_EXPORT_HEADERS = [
	"id",
	"title",
	"status",
	"category",
	"speakers",
	"submitted_at",
	"labels",
] as const;

export type SubmissionExportRow = {
	id: string;
	title: string;
	status: string;
	category: string;
	speakers: string;
	submitted_at: string;
	labels: string;
};

function parseAnswers(raw: string): Record<string, unknown> {
	try {
		const parsed: unknown = JSON.parse(raw);
		if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
			return parsed as Record<string, unknown>;
		}
	} catch {
		// ignore
	}
	return {};
}

function formatSubmittedAt(ms: number | null): string {
	if (ms == null) return "";
	return new Date(ms).toISOString();
}

export async function loadSubmissionExportRows(
	db: D1Database,
	eventId: string,
): Promise<SubmissionExportRow[]> {
	const submissions = await listSubmissionsForEvent(db, eventId);
	const labelRows = await listLabelsForEvent(db, eventId);
	const labelsBySubmission = new Map<string, string[]>();
	for (const row of labelRows) {
		const list = labelsBySubmission.get(row.submission_id) ?? [];
		list.push(row.label);
		labelsBySubmission.set(row.submission_id, list);
	}

	const rows: SubmissionExportRow[] = [];
	for (const submission of submissions) {
		const answers = parseAnswers(submission.answers_json);
		const speakers = await listSpeakersForSubmission(db, submission.id);
		const speakerNames = speakers
			.filter((speaker) => speaker.status !== "removed")
			.map((speaker) => speaker.name);
		const labels = labelsBySubmission.get(submission.id) ?? [];
		rows.push({
			id: submission.id,
			title: titleFromAnswers(answers),
			status: submission.status,
			category: displayCategory(submission.category),
			speakers: speakerNames.join(", "),
			submitted_at: formatSubmittedAt(submission.submitted_at),
			labels: labels.join(", "),
		});
	}
	return rows;
}

export async function loadSubmissionExportForSlug(
	db: D1Database,
	eventSlug: string,
): Promise<
	| { ok: true; eventSlug: string; rows: SubmissionExportRow[] }
	| { ok: false; error: "not_found" }
> {
	const event = await getEventBySlug(db, eventSlug);
	if (!event) return { ok: false, error: "not_found" };
	const rows = await loadSubmissionExportRows(db, event.id);
	return { ok: true, eventSlug: event.slug, rows };
}

function csvEscape(value: string): string {
	if (/[",\n\r]/.test(value)) {
		return `"${value.replaceAll('"', '""')}"`;
	}
	return value;
}

export function submissionsToCsv(rows: SubmissionExportRow[]): string {
	const lines = [
		SUBMISSION_EXPORT_HEADERS.join(","),
		...rows.map((row) =>
			SUBMISSION_EXPORT_HEADERS.map((header) => csvEscape(row[header])).join(","),
		),
	];
	return `${lines.join("\n")}\n`;
}
