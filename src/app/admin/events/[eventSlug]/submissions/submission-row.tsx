import Link from "next/link";
import { Chip, StatusPill, submissionStatusTone } from "@/components/ui";
import { displayCategory } from "@/lib/domain";
import type { SubmissionRow } from "@/lib/db/types";

type Props = {
	eventSlug: string;
	row: SubmissionRow;
	href: string;
	labels: string[];
	speakers: Array<{ id: string; name: string }>;
	taskSummary: { completed: number; required: number } | null;
	assignedReviewerCount: number;
};

export function SubmissionRow({
	row,
	href,
	labels,
	speakers,
	taskSummary,
	assignedReviewerCount,
}: Props) {
	const answers = parseAnswers(row.answers_json);
	const title = typeof answers.title === "string" ? answers.title : "(untitled)";
	const format = typeof answers.format === "string" ? answers.format : null;
	const category = displayCategory(row.category);

	const hasSignals =
		labels.length > 0 ||
		speakers.length > 0 ||
		(taskSummary !== null && taskSummary.required > 0) ||
		assignedReviewerCount > 0;

	return (
		<li className="px-4 py-3 text-sm">
			<div className="flex items-start justify-between gap-3">
				<Link href={href} className="font-medium text-neutral-100 hover:underline">
					{title}
				</Link>
				<div className="flex shrink-0 flex-wrap justify-end gap-1.5">
					<Chip>{category}</Chip>
					<StatusPill tone={submissionStatusTone(row.status)}>
						{row.status.replaceAll("_", " ")}
					</StatusPill>
				</div>
			</div>
			<p className="mt-1 text-neutral-400">
				{row.submitter_name} · {row.submitter_email}
				{format ? ` · ${format}` : ""}
			</p>
			{hasSignals ? (
				<div className="mt-1.5 flex flex-wrap gap-1.5 text-xs text-neutral-500">
					{labels.map((label) => (
						<Chip key={label}>{label}</Chip>
					))}
					{speakers.length > 0 ? (
						<span title={speakers.map((speaker) => speaker.name).join(", ")}>
							{speakers.length} speaker{speakers.length === 1 ? "" : "s"}
						</span>
					) : null}
					{taskSummary !== null && taskSummary.required > 0 ? (
						<span>
							tasks {taskSummary.completed}/{taskSummary.required} required
						</span>
					) : null}
					{assignedReviewerCount > 0 ? (
						<span>
							{assignedReviewerCount} reviewer{assignedReviewerCount === 1 ? "" : "s"}{" "}
							assigned
						</span>
					) : null}
				</div>
			) : null}
		</li>
	);
}

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
