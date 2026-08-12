import Link from "next/link";
import { LandingHero, LandingNav } from "@/components/landing-intro";
import { LogoMark } from "@/components/logo";
import { buttonClasses } from "@/components/ui";

const DEMO_EVENT = "demo-cfp-to-stage";
const REPO_URL = "https://github.com/agrimsingh/conference-engine";

type PipelineAction = {
	kind: "play" | "own";
	href: string;
	label: string;
};

const PIPELINE: {
	stage: string;
	description: string;
	action: PipelineAction;
}[] = [
	{
		stage: "CFP",
		description:
			"The form adapts by talk type: a workshop proposal asks different questions than a keynote. Open the real demo form and click through the conditionals (writes stay blocked).",
		action: {
			kind: "play",
			href: `/e/${DEMO_EVENT}/submit/cfp`,
			label: "Open the demo form",
		},
	},
	{
		stage: "Review",
		description:
			"Reviewers score only what they're assigned, 1–5 against the rubric. The board stays empty until you assign; the chair reads scores, not an email chain.",
		action: {
			kind: "own",
			href: "/demo?perspective=reviewer",
			label: "How review works",
		},
	},
	{
		stage: "Accept",
		description:
			"Stage accept, waitlist, or decline. Nobody is emailed until you release.",
		action: {
			kind: "own",
			href: "/demo?perspective=organizer",
			label: "See the full walkthrough",
		},
	},
	{
		stage: "Speaker ops",
		description:
			"Accepted speakers get a magic-link portal for bio, headshot, and slides. The outstanding-tasks board chases what's still missing.",
		action: {
			kind: "own",
			href: "/demo?perspective=speaker",
			label: "How the portal works",
		},
	},
	{
		stage: "Schedule",
		description:
			"Drag to place; clash checks fire before you drop. Auto-place fills the unscheduled rail in one pass. Attendees subscribe at /e/[slug]/schedule.ics.",
		action: {
			kind: "play",
			href: `/e/${DEMO_EVENT}/schedule`,
			label: "Open the public schedule",
		},
	},
	{
		stage: "Publish",
		description:
			"Speakers and session pages ship with the schedule. Pause an embed without touching the publish gate.",
		action: {
			kind: "play",
			href: `/e/${DEMO_EVENT}/speakers`,
			label: "Browse speakers",
		},
	},
];

const PLAY_NOW = [
	{
		label: "Demo CFP form",
		detail: "Real fields and conditionals",
		href: `/e/${DEMO_EVENT}/submit/cfp`,
	},
	{
		label: "Public schedule",
		detail: "Published programme grid",
		href: `/e/${DEMO_EVENT}/schedule`,
	},
	{
		label: "Speaker directory",
		detail: "Profiles for the demo event",
		href: `/e/${DEMO_EVENT}/speakers`,
	},
] as const;

function ArrowIcon() {
	return (
		<svg
			className="h-3.5 w-3.5"
			viewBox="0 0 16 16"
			fill="none"
			stroke="currentColor"
			strokeWidth="1.5"
			strokeLinecap="round"
			strokeLinejoin="round"
			aria-hidden
		>
			<path d="M3 8h10M9 4l4 4-4 4" />
		</svg>
	);
}

export default function Home() {
	return (
		<div className="min-h-dvh bg-neutral-950 text-neutral-100">
			<LandingNav demoEvent={DEMO_EVENT} repoUrl={REPO_URL} />

			<main>
				<LandingHero demoEvent={DEMO_EVENT} />

				<section
					id="try"
					className="mx-auto max-w-7xl px-4 pb-6 pt-10 sm:px-6 sm:pt-12"
				>
					<div className="flex flex-wrap items-end justify-between gap-3">
						<div>
							<h2 className="text-balance text-2xl font-semibold tracking-tight sm:text-3xl">
								Click around the real UI
							</h2>
							<p className="mt-2 max-w-xl text-pretty text-sm text-neutral-400">
								These open seeded demo routes. Review, accept/notify, and the
								schedule editor run in your own event.
							</p>
						</div>
						<Link
							href="/demo"
							className="text-sm font-medium text-neutral-400 underline underline-offset-2 hover:text-neutral-200"
						>
							Demo route map
						</Link>
					</div>
					<ul className="mt-8 grid gap-3 sm:grid-cols-3">
						{PLAY_NOW.map((item) => (
							<li key={item.href}>
								<Link
									href={item.href}
									className="group flex h-full flex-col rounded-xl border border-neutral-800 bg-neutral-900/50 px-4 py-4 transition-colors hover:border-neutral-600 hover:bg-neutral-900"
								>
									<span className="inline-flex items-center gap-1.5 text-sm font-medium text-neutral-100 group-hover:text-emerald-300">
										{item.label}
										<ArrowIcon />
									</span>
									<span className="mt-1 text-sm text-neutral-500">
										{item.detail}
									</span>
								</Link>
							</li>
						))}
					</ul>
				</section>

				<section
					id="pipeline"
					className="mx-auto max-w-7xl px-4 pb-20 pt-14 sm:px-6 sm:pb-24 sm:pt-16"
				>
					<h2 className="max-w-2xl text-balance text-2xl font-semibold tracking-tight sm:text-3xl">
						One pipeline from CFP to publish
					</h2>
					<p className="mt-3 max-w-xl text-pretty text-neutral-400">
						Green links open the live demo. The rest runs in the event you
						create.
					</p>
					<ol className="mt-10 border-t border-neutral-800">
						{PIPELINE.map((item, index) => (
							<li
								key={item.stage}
								className="grid gap-2 border-b border-neutral-800 py-6 sm:grid-cols-[56px_200px_1fr_220px] sm:items-baseline sm:gap-6"
							>
								<span className="text-sm tabular-nums text-neutral-500">
									{String(index + 1).padStart(2, "0")}
								</span>
								<h3 className="text-lg font-medium text-neutral-100">
									{item.stage}
								</h3>
								<p className="max-w-xl text-pretty text-sm leading-relaxed text-neutral-400">
									{item.description}
								</p>
								<span className="sm:justify-self-end sm:text-right">
									<Link
										href={item.action.href}
										className={
											item.action.kind === "play"
												? "inline-flex items-center gap-1.5 text-sm font-medium text-emerald-400 hover:text-emerald-300"
												: "inline-flex items-center gap-1.5 text-sm font-medium text-neutral-400 hover:text-neutral-200"
										}
									>
										{item.action.label}
										<ArrowIcon />
									</Link>
									{item.action.kind === "own" ? (
										<span className="mt-1 hidden text-xs text-neutral-600 sm:block">
											runs in your event
										</span>
									) : (
										<span className="mt-1 hidden text-xs text-emerald-500/70 sm:block">
											live demo
										</span>
									)}
								</span>
							</li>
						))}
					</ol>
					<div className="mt-8 flex flex-wrap items-center gap-4">
						<Link
							href="/admin"
							className={`inline-flex items-center gap-2 px-4 py-2 ${buttonClasses("primary")}`}
						>
							Create an event to run the rest
							<ArrowIcon />
						</Link>
						<p className="text-sm text-neutral-500">
							Review, accept/notify, speaker portal, and the schedule editor.
						</p>
					</div>
				</section>

				<section
					id="agents"
					className="mx-auto max-w-7xl px-4 pb-16 pt-4 sm:px-6 sm:pb-20"
				>
					<h2 className="max-w-2xl text-balance text-2xl font-semibold tracking-tight sm:text-3xl">
						Clanker-friendly control plane
					</h2>
					<p className="mt-3 max-w-xl text-pretty text-neutral-400">
						Mint a per-event token under Settings → API tokens. Point an agent at
						the admin OpenAPI, then list submissions, decide, place talks, and
						manage speakers with{" "}
						<code className="text-neutral-300">Authorization: Bearer ce_pat_…</code>.
						Same jobs as the organizer UI, without the click path.
					</p>
					<div className="mt-5 flex flex-wrap items-center gap-4">
						<Link
							href="/api/admin/openapi.json"
							className="inline-flex items-center gap-1.5 text-sm font-medium text-emerald-400 hover:text-emerald-300"
						>
							Open the admin OpenAPI
							<ArrowIcon />
						</Link>
						<Link
							href="/admin"
							className="inline-flex items-center gap-1.5 text-sm text-neutral-400 hover:text-neutral-200"
						>
							Create an event to mint a token
							<ArrowIcon />
						</Link>
					</div>
				</section>

				<section className="border-y border-neutral-800 bg-neutral-900/40">
					<div className="mx-auto grid max-w-7xl gap-10 px-4 py-20 sm:px-6 sm:py-24 lg:grid-cols-2 lg:items-center">
						<div>
							<h2 className="text-balance text-2xl font-semibold tracking-tight sm:text-3xl">
								The dashboard that chases people for you
							</h2>
							<p className="mt-3 max-w-lg text-pretty text-neutral-400">
								The outstanding-tasks board flags every speaker deliverable
								until it lands, and charts how submissions paced over the call.
								Reminder emails go out on a schedule or on demand.
							</p>
							<Link
								href="/admin"
								className="mt-5 inline-flex items-center gap-1.5 text-sm font-medium text-emerald-400 hover:text-emerald-300"
							>
								Create your event
								<ArrowIcon />
							</Link>
						</div>
						<div aria-hidden className="select-none">
							<div className="rounded-xl border border-neutral-800 bg-neutral-950 p-4">
								<div className="flex items-center justify-between border-b border-neutral-800 pb-3">
									<p className="text-sm font-medium text-neutral-200">
										Outstanding speaker tasks
									</p>
									<span className="inline-flex items-center gap-1.5 text-[11px] text-emerald-400">
										<span className="relative flex h-2 w-2">
											<span className="absolute h-2 w-2 rounded-full bg-emerald-500/60 motion-safe:animate-ping" />
											<span className="relative h-2 w-2 rounded-full bg-emerald-400" />
										</span>
										Live
									</span>
								</div>
								<ul className="divide-y divide-neutral-800/70 text-sm">
									{[
										{
											speaker: "Maya Chen",
											missing: "slides",
										},
										{
											speaker: "Jonas Weber",
											missing: "headshot · docs",
										},
										{
											speaker: "Ines Almeida",
											missing: "bio · headshot · slides",
										},
									].map((row) => (
										<li
											key={row.speaker}
											className="flex items-center justify-between py-2.5"
										>
											<span className="text-neutral-200">{row.speaker}</span>
											<span className="text-[13px] text-neutral-400">
												missing {row.missing}
											</span>
										</li>
									))}
									<li className="flex items-center justify-between py-2.5">
										<span className="text-neutral-200">Priya Nair</span>
										<span className="inline-flex items-center gap-1 text-[13px] text-emerald-400">
											all tasks complete
										</span>
									</li>
								</ul>
							</div>
						</div>
					</div>
				</section>

				<section
					id="deploy"
					className="mx-auto max-w-7xl px-4 py-20 sm:px-6 sm:py-24"
				>
					<div className="grid gap-10 lg:grid-cols-2 lg:items-center">
						<div>
							<h2 className="text-balance text-2xl font-semibold tracking-tight sm:text-3xl">
								Deploy your own
							</h2>
							<p className="mt-3 max-w-lg text-pretty text-neutral-400">
								One repo on your own Cloudflare account. Programme data,
								speaker uploads, and live schedule updates ship with the
								Worker. No servers to babysit.
							</p>
							<a
								href={`${REPO_URL}#readme`}
								target="_blank"
								rel="noreferrer"
								className="mt-5 inline-flex items-center gap-1.5 text-sm font-medium text-emerald-400 hover:text-emerald-300"
							>
								Full setup in the README
								<ArrowIcon />
							</a>
						</div>
						<pre className="overflow-x-auto rounded-xl border border-neutral-800 bg-neutral-900 p-5 font-mono text-[13px] leading-relaxed text-neutral-300">
							{`git clone ${REPO_URL}
cd conference-engine
npm install
npm run deploy`}
						</pre>
					</div>
				</section>
			</main>

			<footer className="border-t border-neutral-800">
				<div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-4 py-8 text-sm text-neutral-400 sm:px-6">
					<div className="flex items-center gap-2">
						<LogoMark />
						<span>
							conference-engine. CFP to stage for conference organizers
						</span>
					</div>
					<div className="flex flex-wrap items-center gap-5">
						<a
							className="hover:text-neutral-100"
							href={REPO_URL}
							target="_blank"
							rel="noreferrer"
						>
							GitHub
						</a>
						<Link className="hover:text-neutral-100" href="/compare">
							Compare
						</Link>
						<Link
							className="hover:text-neutral-100"
							href={`/e/${DEMO_EVENT}/submit/cfp`}
						>
							Demo CFP
						</Link>
						<Link
							className="hover:text-neutral-100"
							href={`/e/${DEMO_EVENT}/schedule`}
						>
							Schedule
						</Link>
						<Link className="hover:text-neutral-100" href="/admin">
							Create your event
						</Link>
					</div>
				</div>
			</footer>
		</div>
	);
}
