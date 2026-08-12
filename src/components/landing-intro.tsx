import Link from "next/link";
import { LandingProductDemo } from "@/components/landing-product-demo";
import { LandingScheduleScene } from "@/components/landing-schedule-scene";
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
		<>
			<section className="mx-auto max-w-7xl px-4 pb-10 pt-14 sm:px-6 sm:pt-16">
				<h1 className="max-w-5xl text-balance text-4xl font-semibold leading-tight tracking-[-0.02em] sm:text-5xl lg:text-6xl">
					The work between the call{" "}
					<span className="text-emerald-400">and the first session.</span>
				</h1>
				<p className="mt-4 max-w-2xl text-pretty text-base leading-relaxed text-neutral-400">
					The open-source alternative to Sessionboard and Sessionize. Collect
					talks, pick speakers, build the schedule, publish. Speakers only get
					emailed when you hit send. Attendees only see what you publish.
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
			</section>
			<section className="relative pb-6">
				<LandingScheduleScene />
			</section>
		</>
	);
}

export function LandingWorkspace() {
	return (
		<section
			id="workspace"
			className="mx-auto max-w-7xl px-4 pb-16 pt-8 sm:px-6 sm:pb-20 sm:pt-10"
		>
			<h2 className="max-w-2xl text-balance text-2xl font-semibold tracking-tight sm:text-3xl">
				Here&apos;s the admin
			</h2>
			<p className="mt-3 max-w-xl text-pretty text-neutral-400">
				Same screens you get after you create an event.
			</p>
			<div className="mt-8">
				<LandingProductDemo />
			</div>
		</section>
	);
}
