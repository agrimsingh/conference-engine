import Link from "next/link";
import { LogoMark } from "@/components/logo";
import { buttonClasses } from "@/components/ui";

type Props = {
	demoEvent: string;
	repoUrl: string;
};

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
					<a className="hover:text-neutral-100" href="#pipeline">
						Features
					</a>
					<Link
						className="hover:text-neutral-100"
						href={`/e/${demoEvent}/schedule`}
					>
						Schedule
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

export function LandingHero() {
	return (
		<section className="mx-auto max-w-7xl px-4 pb-10 pt-14 sm:px-6 sm:pt-16">
			<p className="text-xs font-medium uppercase tracking-wide text-neutral-500">
				Live for organizers
			</p>
			<h1 className="mt-3 max-w-5xl text-balance text-4xl font-semibold tracking-[-0.02em] sm:text-5xl lg:text-6xl">
				Build your event.{" "}
				<span className="text-emerald-400">From CFP to stage.</span>
			</h1>
			<p className="mt-4 max-w-2xl text-pretty text-base leading-relaxed text-neutral-400">
			One workspace from open call to live schedule. Stage decisions before
			they send, collect everything speakers owe through a portal, and
			publish when the programme is settled. Nothing to install.
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
					href="/demo"
					className="inline-flex items-center gap-1.5 text-neutral-300 hover:text-neutral-100"
				>
					Explore the live demo
					<ArrowIcon />
				</Link>
			</div>
			<p className="mt-4 text-xs text-neutral-500">
				Magic-link sign-in · guided event setup · publish when you are ready
			</p>
		</section>
	);
}
