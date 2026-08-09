import Link from "next/link";
import type { SubmissionAnswerDisplay } from "@/lib/cfp/submission-answers";

type Props = {
	answers: SubmissionAnswerDisplay[];
};

export function SubmissionAnswersList({ answers }: Props) {
	if (!answers.length) return null;
	return (
		<dl className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
			{answers.map((answer) => (
				<div key={answer.key}>
					<dt className="text-neutral-500">{answer.label}</dt>
					<dd className="mt-0.5 whitespace-pre-wrap text-neutral-300">
						{answer.kind === "file" ? (
							<Link
								className="font-medium text-neutral-100 underline underline-offset-2 hover:text-white"
								href={answer.downloadHref}
							>
								Download {answer.filename}
							</Link>
						) : (
							answer.value
						)}
					</dd>
				</div>
			))}
		</dl>
	);
}
