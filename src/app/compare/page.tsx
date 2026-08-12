import type { Metadata } from "next";
import Link from "next/link";
import { LandingNav } from "@/components/landing-intro";
import { LogoMark } from "@/components/logo";
import { buttonClasses } from "@/components/ui";

const DEMO_EVENT = "demo-cfp-to-stage";
const REPO_URL = "https://github.com/agrimsingh/conference-engine";

export const metadata: Metadata = {
	title: "Compare · conference-engine",
	description:
		"The programme job, not the $40k suite. How this compares to Sessionboard and Sessionize, and how to run your own copy.",
};

const COMPARE_ROWS: {
	capability: string;
	ours: string;
	sessionboard: string;
	sessionize: string;
}[] = [
	{
		capability: "Programme job (CFP → stage)",
		ours: "Full pipeline in one workspace",
		sessionboard: "Program module inside a larger suite",
		sessionize: "Core job; lighter suite",
	},
	{
		capability: "Conditional CFP forms",
		ours: "Built in; Conference preset by default",
		sessionboard: "Yes (suite)",
		sessionize: "Yes",
	},
	{
		capability: "Review scoring",
		ours: "Named reviewers, rubric, fail-closed board",
		sessionboard: "Yes",
		sessionize: "Yes",
	},
	{
		capability: "Decide ≠ notify",
		ours: "Stage decisions; email when ready",
		sessionboard: "Suite workflow",
		sessionize: "Typically coupled",
	},
	{
		capability: "Speaker portal + chasing",
		ours: "Magic-link portal + live outstanding board",
		sessionboard: "Yes (suite)",
		sessionize: "Speaker profile flow",
	},
	{
		capability: "Schedule with conflict checks",
		ours: "Drag grid; room + speaker clashes",
		sessionboard: "Yes",
		sessionize: "Scheduling tools",
	},
	{
		capability: "Self-host / open source",
		ours: "MIT; your Cloudflare account",
		sessionboard: "Hosted only",
		sessionize: "Hosted only",
	},
	{
		capability: "Speaker CRM (cross-event contacts)",
		ours: "Account-scoped directory, pipeline, import, handoff",
		sessionboard: "Bundled contact database",
		sessionize: "Limited / separate tools",
	},
	{
		capability: "Marketing, CMS, ticketing",
		ours: "Out of scope on purpose",
		sessionboard: "Bundled (Program + more)",
		sessionize: "Limited / separate tools",
	},
	{
		capability: "Typical cost shape",
		ours: "Free software; you run it",
		sessionboard: "Enterprise suite ($40k+/yr class)",
		sessionize: "Per-event hosted pricing",
	},
];

const DOES_NOT: string[] = [
	"Ticketing, payments, or registration checkout",
	"Marketing automation or a conference CMS. Speaker CRM ships.",
	"AI-assisted review. Humans score.",
	"Pulling Airtable or Accelevents edits back into the programme. Those are one-way exits.",
	"Password accounts. Organizers sign in with a magic link.",
];

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

export default function ComparePage() {
	return (
		<div className="min-h-dvh bg-neutral-950 text-neutral-100">
			<LandingNav demoEvent={DEMO_EVENT} repoUrl={REPO_URL} />

			<main>
				<section className="mx-auto max-w-7xl px-4 pb-10 pt-14 sm:px-6 sm:pt-16">
					<h1 className="max-w-3xl text-balance text-4xl font-semibold tracking-[-0.02em] sm:text-5xl">
						The programme job, not the $40k suite.
					</h1>
					<p className="mt-4 max-w-2xl text-pretty text-base leading-relaxed text-neutral-400">
						Sessionboard is a $40k suite. Sessionize bills per event. This is
						the programme job, open source, on an account you control.
					</p>
					<div className="mt-6 flex flex-wrap items-center gap-5 text-sm font-medium">
						<Link
							href="/admin"
							className={`inline-flex items-center gap-2 px-4 py-2 ${buttonClasses("primary")}`}
						>
							Create your event
							<ArrowIcon />
						</Link>
						<a
							href="#self-host"
							className="inline-flex items-center gap-1.5 text-neutral-300 hover:text-neutral-100"
						>
							Clone it yourself
							<ArrowIcon />
						</a>
					</div>
				</section>

				<section
					id="vs"
					aria-labelledby="vs-heading"
					className="mx-auto max-w-7xl px-4 pb-16 sm:px-6"
				>
					<h2
						id="vs-heading"
						className="text-balance text-2xl font-semibold tracking-tight sm:text-3xl"
					>
						Against Sessionboard and Sessionize
					</h2>

					{/* Mobile: stacked cards */}

					{/* Mobile: stacked cards */}
					<ul className="mt-8 space-y-3 md:hidden">
						{COMPARE_ROWS.map((row) => (
							<li
								key={row.capability}
								className="rounded-xl border border-neutral-800 bg-neutral-900/40 px-4 py-3"
							>
								<p className="text-sm font-medium text-neutral-100">
									{row.capability}
								</p>
								<dl className="mt-2 space-y-1.5 text-[13px] leading-snug">
									<div>
										<dt className="text-emerald-400/90">conference-engine</dt>
										<dd className="text-neutral-300">{row.ours}</dd>
									</div>
									<div>
										<dt className="text-neutral-500">Sessionboard</dt>
										<dd className="text-neutral-400">{row.sessionboard}</dd>
									</div>
									<div>
										<dt className="text-neutral-500">Sessionize</dt>
										<dd className="text-neutral-400">{row.sessionize}</dd>
									</div>
								</dl>
							</li>
						))}
					</ul>

					{/* Desktop table */}
					<div className="mt-8 hidden overflow-x-auto md:block">
						<table className="w-full min-w-[720px] border-collapse text-left text-sm">
							<thead>
								<tr className="border-b border-neutral-800 text-neutral-400">
									<th className="py-3 pr-4 font-medium">Capability</th>
									<th className="py-3 pr-4 font-medium text-emerald-400/90">
										conference-engine
									</th>
									<th className="py-3 pr-4 font-medium">Sessionboard</th>
									<th className="py-3 font-medium">Sessionize</th>
								</tr>
							</thead>
							<tbody>
								{COMPARE_ROWS.map((row) => (
									<tr
										key={row.capability}
										className="border-b border-neutral-800/80 align-top"
									>
										<th className="py-3.5 pr-4 font-medium text-neutral-200">
											{row.capability}
										</th>
										<td className="py-3.5 pr-4 text-neutral-300">{row.ours}</td>
										<td className="py-3.5 pr-4 text-neutral-400">
											{row.sessionboard}
										</td>
										<td className="py-3.5 text-neutral-400">{row.sessionize}</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
					<p className="mt-3 text-xs text-neutral-500">
						The table is positioning, not a feature audit.{" "}
						<a
							href={`${REPO_URL}/blob/main/PARITY.md`}
							target="_blank"
							rel="noreferrer"
							className="underline underline-offset-2 hover:text-neutral-300"
						>
							PARITY.md
						</a>{" "}
						is the route map.
					</p>
				</section>

				<section
					id="not"
					aria-labelledby="not-heading"
					className="mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-20"
				>
					<h2
						id="not-heading"
						className="text-balance text-2xl font-semibold tracking-tight sm:text-3xl"
					>
						What we skip
					</h2>
					<p className="mt-3 max-w-2xl text-pretty text-sm text-neutral-400">
						The job is the programme. Adjacent scope stays out even when it
						looks easy.
					</p>
					<ul className="mt-8 max-w-2xl space-y-3 border-t border-neutral-800 pt-6">
						{DOES_NOT.map((item) => (
							<li
								key={item}
								className="flex gap-3 text-sm leading-relaxed text-neutral-300"
							>
								<span
									className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-neutral-600"
									aria-hidden
								/>
								{item}
							</li>
						))}
					</ul>
				</section>

				<section
					id="self-host"
					aria-labelledby="self-host-heading"
					className="border-t border-neutral-800 bg-neutral-900/40"
				>
					<div className="mx-auto grid max-w-7xl gap-10 px-4 py-16 sm:px-6 sm:py-20 lg:grid-cols-2 lg:items-start">
						<div>
							<h2
								id="self-host-heading"
								className="text-balance text-2xl font-semibold tracking-tight sm:text-3xl"
							>
								You keep the data
							</h2>
							<p className="mt-3 max-w-lg text-pretty text-sm leading-relaxed text-neutral-400">
								Clone it onto your Cloudflare account. There is no per-event
								invoice.
							</p>
							<a
								href={`${REPO_URL}#deploy-sketch`}
								target="_blank"
								rel="noreferrer"
								className="mt-5 inline-flex items-center gap-1.5 text-sm font-medium text-emerald-400 hover:text-emerald-300"
							>
								Full setup in the README
								<ArrowIcon />
							</a>
						</div>
						<pre className="overflow-x-auto rounded-xl border border-neutral-800 bg-neutral-950 p-5 font-mono text-[13px] leading-relaxed text-neutral-300">
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
						<span>conference-engine</span>
					</div>
					<div className="flex flex-wrap items-center gap-5">
						<Link className="hover:text-neutral-100" href="/">
							Home
						</Link>
						<a
							className="hover:text-neutral-100"
							href={REPO_URL}
							target="_blank"
							rel="noreferrer"
						>
							GitHub
						</a>
						<Link className="hover:text-neutral-100" href="/demo">
							Demo
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
