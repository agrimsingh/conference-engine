import Link from "next/link";

const DEMO_EVENT = "aie-sandbox";

const journeys = [
	{
		role: "Speaker",
		title: "Submit a talk",
		blurb: "Pick a format, fill adaptive fields, get a clear confirmation.",
		href: `/e/${DEMO_EVENT}/submit/cfp`,
		cta: "Open CFP",
	},
	{
		role: "Organizer",
		title: "Triage & schedule",
		blurb: "Filter submissions, accept/reject, then drag talks onto the grid.",
		href: "/admin/bypass",
		cta: "Organizer sign-in (demo)",
	},
	{
		role: "Reviewer",
		title: "Score proposals",
		blurb: "Open the review board after activating a plan from Submissions.",
		href: `/review?event=${DEMO_EVENT}`,
		cta: "Review board",
	},
	{
		role: "Speaker",
		title: "Complete onboarding",
		blurb: "Magic-link portal for bio, headshot, slides, and docs.",
		href: "/portal",
		cta: "Speaker portal",
	},
	{
		role: "Everyone",
		title: "Watch the program",
		blurb: "Live outstanding tasks for organizers; public schedule for attendees.",
		href: `/e/${DEMO_EVENT}/schedule`,
		cta: "Public schedule",
	},
] as const;

export default function Home() {
	return (
		<main className="min-h-dvh bg-neutral-50 text-neutral-900">
			<div className="mx-auto flex max-w-3xl flex-col gap-10 px-4 py-16 sm:py-20">
				<header className="space-y-4">
					<p className="text-xs font-medium uppercase tracking-wide text-neutral-500">
						conference-engine
					</p>
					<h1 className="text-balance text-4xl font-semibold tracking-tight sm:text-5xl">
						Program ops for AI Engineer
					</h1>
					<p className="max-w-xl text-pretty text-base text-neutral-600">
						CFP → review → accept → speaker tasks → schedule → publish. A fast
						Sessionboard alternative, demoed against the AIE sandbox event.
					</p>
					<div className="flex flex-wrap gap-3 pt-1">
						<Link
							href={`/e/${DEMO_EVENT}/submit/cfp`}
							className="rounded-md bg-neutral-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-neutral-800"
						>
							Try the public CFP
						</Link>
						<Link
							href="/admin/bypass"
							className="rounded-md border border-neutral-300 bg-white px-4 py-2.5 text-sm font-medium text-neutral-800 hover:bg-neutral-100"
						>
							Organizer sign-in (demo)
						</Link>
					</div>
				</header>

				<section aria-label="Demo journeys" className="space-y-3">
					<h2 className="text-sm font-medium text-neutral-500">
						Walk the demo
					</h2>
					<ul className="divide-y divide-neutral-200 rounded-lg border border-neutral-200 bg-white">
						{journeys.map((item) => (
							<li
								key={item.href + item.title}
								className="flex flex-wrap items-start justify-between gap-3 px-4 py-4"
							>
								<div className="min-w-0 max-w-md space-y-1">
									<p className="text-xs font-medium uppercase tracking-wide text-neutral-500">
										{item.role}
									</p>
									<p className="font-medium text-neutral-900">{item.title}</p>
									<p className="text-pretty text-sm text-neutral-600">
										{item.blurb}
									</p>
								</div>
								<Link
									href={item.href}
									className="shrink-0 text-sm font-medium text-neutral-900 underline underline-offset-2 hover:text-neutral-600"
								>
									{item.cta}
								</Link>
							</li>
						))}
					</ul>
					<p className="text-xs text-neutral-500">
						Also:{" "}
						<Link
							className="underline underline-offset-2"
							href={`/admin/events/${DEMO_EVENT}/dashboard`}
						>
							live dashboard
						</Link>
						{" · "}
						<Link
							className="underline underline-offset-2"
							href={`/admin/events/${DEMO_EVENT}/schedule`}
						>
							admin schedule
						</Link>
						{" · "}
						<Link
							className="underline underline-offset-2"
							href={`/admin/events/${DEMO_EVENT}/tasks`}
						>
							speaker tasks
						</Link>
					</p>
				</section>
			</div>
		</main>
	);
}
