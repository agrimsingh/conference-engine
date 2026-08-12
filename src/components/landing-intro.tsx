import Link from "next/link";
import { LandingDecisionsScene } from "@/components/landing-decisions-scene";
import { LogoMark } from "@/components/logo";
import { buttonClasses } from "@/components/ui";

type Props = {
	demoEvent: string;
	repoUrl: string;
};

const PRINCIPLES = [
	{
		title: "One programme",
		body: "Public page, embed, and API are projections of the same records.",
	},
	{
		title: "After accept is half the job",
		body: "Bios, headshots, decks, chasing.",
	},
	{
		title: "Nothing leaks",
		body: "Stage decisions. Reviewers don't get contact emails. Public names are confirmed speakers only. Unconfirmed reads as \"Speaker to be announced\".",
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

export function LandingNav({ demoEvent, repoUrl }: Props) {
	return (
		<header className="sticky top-0 z-40 border-b border-neutral-800/70 bg-neutral-950/80 backdrop-blur">
			<nav className="mx-auto flex h-14 max-w-7xl items-center gap-6 px-4 sm:px-6">
				<Link href="/" className="flex items-center gap-2">
					<LogoMark />
					<span className="text-sm font-semibold tracking-tight">
						conference-engine
					</span>
				</Link>
				<div className="ml-auto hidden items-center gap-5 text-sm text-neutral-400 sm:flex">
					<Link className="hover:text-neutral-100" href="/#try">
						Try
					</Link>
					<Link
						className="hover:text-neutral-100"
						href={`/e/${demoEvent}/submit/cfp`}
					>
						Demo CFP
					</Link>
					<Link
						className="hover:text-neutral-100"
						href={`/e/${demoEvent}/schedule`}
					>
						Schedule
					</Link>
					<Link className="hover:text-neutral-100" href="/compare">
						Compare
					</Link>
					<a
						className="hover:text-neutral-100"
						href={`${repoUrl}#readme`}
						target="_blank"
						rel="noreferrer"
					>
						Docs
					</a>
					<a
						className="hover:text-neutral-100"
						href={repoUrl}
						target="_blank"
						rel="noreferrer"
					>
						GitHub
					</a>
				</div>
				<Link
					href="/admin"
					className={`ml-auto sm:ml-0 ${buttonClasses("secondary")}`}
				>
					Organizer sign in
				</Link>
			</nav>
		</header>
	);
}

export function LandingHero({ demoEvent }: { demoEvent: string }) {
	return (
		<section className="mx-auto max-w-7xl px-4 pb-10 pt-14 sm:px-6 sm:pt-16">
			<p className="text-xs font-medium uppercase tracking-wide text-neutral-500">
				Live for organizers
			</p>
			<h1 className="mt-3 max-w-5xl text-balance text-[1.75rem] font-semibold leading-tight tracking-[-0.02em] sm:text-5xl lg:text-6xl">
				The work between the call{" "}
				<span className="text-emerald-400">and the first session.</span>
			</h1>
			<p className="mt-4 max-w-2xl text-pretty text-base leading-relaxed text-neutral-400">
				Stage accept and decline in private. Release when the programme is
				settled. Speakers get the email. The public page stays quiet until you
				publish.
			</p>
			<div className="mt-6 flex flex-wrap items-center gap-5 text-sm font-medium">
				<Link
					href="/admin"
					className={`inline-flex items-center gap-2 px-4 py-2 ${buttonClasses("primary")}`}
				>
					Create your event
					<ArrowIcon />
				</Link>
				<Link
					href={`/e/${demoEvent}/submit/cfp`}
					className="inline-flex items-center gap-1.5 text-neutral-300 hover:text-neutral-100"
				>
					Open the demo CFP
					<ArrowIcon />
				</Link>
			</div>
			<p className="mt-4 text-xs text-neutral-500">
				Public demo is read-only · agents use per-event API tokens
			</p>
			<div className="mt-12 space-y-8">
				<LandingDecisionsScene />
				<ol className="grid gap-6 border-t border-neutral-800 pt-6 sm:grid-cols-3 sm:gap-8">
					{PRINCIPLES.map((item) => (
						<li key={item.title}>
							<p className="text-sm font-medium text-neutral-100">
								{item.title}
							</p>
							<p className="mt-1 text-sm leading-relaxed text-neutral-400">
								{item.body}
							</p>
						</li>
					))}
				</ol>
			</div>
		</section>
	);
}
