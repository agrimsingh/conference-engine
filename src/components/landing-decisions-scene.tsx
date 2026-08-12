import { StatusPill, buttonClasses } from "@/components/ui";

const WORKFLOW = [
	{ label: "CFP", current: false },
	{ label: "Review", current: false },
	{ label: "Accept", current: true },
	{ label: "Speaker ops", current: false },
	{ label: "Schedule", current: false },
	{ label: "Publish", current: false },
] as const;

type DecisionQueue = "Accept" | "Decline";

const STAGED: {
	path: string;
	acceptCount: number;
	declineCount: number;
	rows: readonly {
		title: string;
		speaker: string;
		queue: DecisionQueue;
		score: string;
	}[];
} = {
	path: "/admin/events/summit/submissions",
	acceptCount: 18,
	declineCount: 41,
	rows: [
		{
			title: "Postgres for AI workloads",
			speaker: "Maya Chen",
			queue: "Accept",
			score: "4.6",
		},
		{
			title: "Agents in production",
			speaker: "Jonas Weber",
			queue: "Accept",
			score: "4.4",
		},
		{
			title: "Evals beyond vibes",
			speaker: "Priya Nair",
			queue: "Accept",
			score: "4.2",
		},
		{
			title: "Prompt injection red-teaming",
			speaker: "Felix Braun",
			queue: "Decline",
			score: "2.1",
		},
		{
			title: "Voice agents in production",
			speaker: "Julia Kovacs",
			queue: "Decline",
			score: "2.8",
		},
	],
};

export function LandingDecisionsScene() {
	return (
		<div aria-hidden className="select-none" role="presentation">
			<div className="overflow-hidden rounded-xl border border-neutral-800 bg-neutral-950">
				<p className="truncate border-b border-neutral-800 px-4 py-2 font-mono text-[11px] text-neutral-500">
					{STAGED.path}
				</p>
				<div className="flex flex-wrap gap-x-4 gap-y-1 border-b border-neutral-800 px-4 py-2.5">
					{WORKFLOW.map((step) => (
						<span
							key={step.label}
							className={
								step.current
									? "border-b border-neutral-100 pb-0.5 text-[11px] font-medium text-neutral-100"
									: "text-[11px] text-neutral-500"
							}
						>
							{step.label}
						</span>
					))}
				</div>
				<div className="px-4 py-4">
					<p className="text-xs font-medium uppercase tracking-wide text-neutral-500">
						To notify
					</p>
					<p className="mt-1 text-sm text-neutral-400">
						<span className="tabular-nums text-neutral-100">
							{STAGED.acceptCount}
						</span>{" "}
						accept
						<span className="text-neutral-600"> · </span>
						<span className="tabular-nums text-neutral-100">
							{STAGED.declineCount}
						</span>{" "}
						decline
					</p>
					<div className="mt-4">
						<span className={buttonClasses("secondary")}>Release decisions</span>
					</div>
					<p className="mt-2 max-w-md text-[13px] leading-relaxed text-neutral-500">
						Decisions stay private until you release. Then submitters get the
						email.
					</p>
				</div>
				<ul className="divide-y divide-neutral-800 border-t border-neutral-800">
					{STAGED.rows.map((row) => (
						<li key={row.title} className="px-4 py-3">
							<div className="flex items-start justify-between gap-3">
								<p className="min-w-0 truncate text-sm font-medium text-neutral-100">
									{row.title}
								</p>
								<StatusPill
									tone={row.queue === "Accept" ? "positive" : "negative"}
								>
									{row.queue}
								</StatusPill>
							</div>
							<p className="mt-1 flex items-center justify-between gap-3 text-[13px] text-neutral-400">
								<span className="truncate">{row.speaker}</span>
								<span className="tabular-nums">{row.score}</span>
							</p>
						</li>
					))}
				</ul>
			</div>
		</div>
	);
}
