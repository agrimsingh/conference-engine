import Link from "next/link";
import { LandingHero, LandingNav, LandingWorkspace } from "@/components/landing-intro";
import { LogoMark } from "@/components/logo";

const DEMO_EVENT = "demo-cfp-to-stage";
const REPO_URL = "https://github.com/agrimsingh/conference-engine";

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
				<LandingWorkspace />

				<section
					id="agents"
					className="mx-auto max-w-7xl px-4 pb-16 pt-4 sm:px-6 sm:pb-20"
				>
					<h2 className="max-w-2xl text-balance text-2xl font-semibold tracking-tight sm:text-3xl">
						Clanker-friendly control plane
					</h2>
					<p className="mt-3 max-w-xl text-pretty text-neutral-400">
						Mint a per-event token. Point a clanker at the admin OpenAPI. Send{" "}
						<code className="text-neutral-300">Authorization: Bearer ce_pat_…</code>
						. It lists submissions, decides, places talks, and chases speakers.
						Same jobs as the UI. No click path.
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
							Mint a token in your event
							<ArrowIcon />
						</Link>
					</div>
				</section>

				<section
					id="deploy"
					className="mx-auto max-w-7xl px-4 py-20 sm:px-6 sm:py-24"
				>
					<div className="grid gap-10 lg:grid-cols-2 lg:items-center">
						<div>
							<h2 className="text-balance text-2xl font-semibold tracking-tight sm:text-3xl">
								Free software. You run it.
							</h2>
							<p className="mt-3 max-w-lg text-pretty text-neutral-400">
								No per-event bill. No $40k suite. The data stays on an account
								you control.
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
						<span>conference-engine</span>
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
