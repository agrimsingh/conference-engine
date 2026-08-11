import Link from "next/link";
import { buttonClasses, StatusPill } from "@/components/ui";
import {
	programLifecycleCurrent,
	type ProgramLifecycleStatus,
	type ProgramLifecycleStep,
} from "@/lib/events/program-lifecycle";

function statusTone(
	status: ProgramLifecycleStatus,
): "positive" | "warning" | "neutral" {
	switch (status) {
		case "completed":
			return "positive";
		case "current":
			return "warning";
		case "blocked":
			return "neutral";
		default: {
			const _exhaustive: never = status;
			return _exhaustive;
		}
	}
}

function statusLabel(status: ProgramLifecycleStatus, isNext: boolean): string {
	if (isNext) return "Next";
	switch (status) {
		case "completed":
			return "Done";
		case "current":
			return "Current";
		case "blocked":
			return "Later";
		default: {
			const _exhaustive: never = status;
			return _exhaustive;
		}
	}
}

export function ProgramLifecycleStrip({
	steps,
}: {
	steps: ProgramLifecycleStep[];
}) {
	const current = programLifecycleCurrent(steps);
	const completedCount = steps.filter((step) => step.status === "completed").length;

	return (
		<section aria-label="Program lifecycle" className="space-y-3">
			<div className="flex flex-wrap items-baseline justify-between gap-2">
				<div>
					<h2 className="text-sm font-medium text-neutral-100">Program lifecycle</h2>
					<p className="mt-1 text-xs text-neutral-500">
						{completedCount} of {steps.length} stages complete. Work the sequence; the
						cockpit below lists actionable blockers.
					</p>
				</div>
				{current ? (
					<Link href={current.href} className={buttonClasses("primary", "sm")}>
						{current.cta}
					</Link>
				) : null}
			</div>

			<ol className="divide-y divide-neutral-800 border-y border-neutral-800">
				{steps.map((step, index) => {
					const isNext = current?.key === step.key;
					const interactive = step.status !== "blocked";
					const rowClass = isNext ? "bg-neutral-900/80" : undefined;
					const content = (
						<>
							<span className="flex min-w-0 items-start gap-3">
								<span
									className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-medium ${
										step.status === "completed"
											? "bg-emerald-500/20 text-emerald-300"
											: isNext
												? "bg-amber-500/20 text-amber-200"
												: "bg-neutral-900 text-neutral-600"
									}`}
								>
									{step.status === "completed" ? "✓" : index + 1}
								</span>
								<span className="min-w-0">
									<span className="flex flex-wrap items-center gap-2">
										<span
											className={`font-medium ${
												step.status === "blocked"
													? "text-neutral-500"
													: "text-neutral-100"
											}`}
										>
											{step.label}
										</span>
										<StatusPill tone={statusTone(step.status)}>
											{statusLabel(step.status, isNext)}
										</StatusPill>
									</span>
									<span
										className={`mt-1 block text-sm ${
											step.status === "blocked"
												? "text-neutral-600"
												: "text-neutral-400"
										}`}
									>
										{step.detail}
									</span>
								</span>
							</span>
							<span
								className={`shrink-0 text-sm ${
									isNext
										? "font-medium text-emerald-400"
										: step.status === "completed"
											? "text-neutral-400"
											: "text-neutral-600"
								}`}
							>
								{step.cta}
							</span>
						</>
					);

					return (
						<li key={step.key} className={rowClass}>
							{interactive ? (
								<Link
									href={step.href}
									className="flex flex-col gap-3 px-1 py-3.5 sm:flex-row sm:items-center sm:justify-between hover:bg-neutral-900/60"
								>
									{content}
								</Link>
							) : (
								<div className="flex flex-col gap-3 px-1 py-3.5 opacity-70 sm:flex-row sm:items-center sm:justify-between">
									{content}
								</div>
							)}
						</li>
					);
				})}
			</ol>
		</section>
	);
}
