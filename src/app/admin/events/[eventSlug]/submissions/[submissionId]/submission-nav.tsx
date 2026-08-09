import Link from "next/link";

type Props = {
	eventSlug: string;
	backHref: string;
	prevHref: string | null;
	nextHref: string | null;
	position: { index: number; total: number } | null;
};

export function SubmissionNav({
	backHref,
	prevHref,
	nextHref,
	position,
}: Props) {
	return (
		<nav
			className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-3 px-4 pt-6 text-sm"
			aria-label="Submission navigation"
		>
			<Link
				className="rounded-md border border-neutral-700 px-3 py-2 text-neutral-200 hover:border-neutral-600"
				href={backHref}
			>
				← Back to submissions
			</Link>
			{position ? (
				<div className="flex flex-wrap items-center gap-2">
					<span className="text-neutral-500">
						Submission {position.index + 1} of {position.total}
					</span>
					{prevHref ? (
						<Link
							className="rounded-md border border-neutral-700 px-3 py-2 text-neutral-200 hover:border-neutral-600"
							href={prevHref}
						>
							Previous
						</Link>
					) : (
						<span
							aria-disabled="true"
							className="rounded-md border border-neutral-800 px-3 py-2 text-neutral-600"
						>
							Previous
						</span>
					)}
					{nextHref ? (
						<Link
							className="rounded-md border border-neutral-700 px-3 py-2 text-neutral-200 hover:border-neutral-600"
							href={nextHref}
						>
							Next
						</Link>
					) : (
						<span
							aria-disabled="true"
							className="rounded-md border border-neutral-800 px-3 py-2 text-neutral-600"
						>
							Next
						</span>
					)}
				</div>
			) : null}
		</nav>
	);
}
