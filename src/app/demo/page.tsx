import Link from "next/link";
import {
	DEMO_EVENT_SLUG,
	DEMO_PERSPECTIVES,
	type DemoPerspective,
} from "@/lib/demo/data";
import { buttonClasses } from "@/components/ui";

type Props = { searchParams: Promise<{ perspective?: string }> };

const DEFAULT_PERSPECTIVE: DemoPerspective = "applicant";

type LauncherCard = {
	eyebrow: string;
	title: string;
	body: string;
	primary: { href: string; label: string };
	secondary?: { href: string; label: string };
	steps?: string[];
};

function isPerspective(value: string | undefined): value is DemoPerspective {
	return DEMO_PERSPECTIVES.some((perspective) => perspective.id === value);
}

function launcherFor(perspective: DemoPerspective): LauncherCard {
	switch (perspective) {
		case "applicant":
			return {
				eyebrow: "Applicant",
				title: "The demo CFP",
				body: "Open the real form. Click through formats. Submissions stay blocked.",
				primary: {
					href: `/e/${DEMO_EVENT_SLUG}/submit/cfp`,
					label: "Open demo CFP",
				},
				secondary: {
					href: `/e/${DEMO_EVENT_SLUG}/schedule`,
					label: "Public schedule",
				},
			};
		case "attendee":
			return {
				eyebrow: "Attendee",
				title: "Published programme",
				body: "Only published sessions appear. Speakers and the embed read the same event.",
				primary: {
					href: `/e/${DEMO_EVENT_SLUG}/schedule`,
					label: "Open public schedule",
				},
				secondary: {
					href: `/e/${DEMO_EVENT_SLUG}/speakers`,
					label: "Public speakers",
				},
			};
		case "organizer":
			return {
				eyebrow: "Organizer",
				title: "Run it in your event",
				body: "The public demo does not write. Create an event and run the programme there.",
				primary: { href: "/admin", label: "Create your event" },
				secondary: {
					href: `/e/${DEMO_EVENT_SLUG}/schedule`,
					label: "See published schedule",
				},
				steps: [
					"Create an event, open the CFP, set a close date.",
					"Submit once as a speaker and confirm the email.",
					"Add a reviewer, assign, score.",
					"Accept, then send the email. Portal tasks appear.",
					"Place talks on the grid, then publish.",
					"Public schedule, speakers, and the embed update together.",
				],
			};
		case "reviewer":
			return {
				eyebrow: "Reviewer",
				title: "Review needs your event",
				body: "Create an event, open a CFP, and assign reviewers. They score on a board they get a link to.",
				primary: { href: "/admin", label: "Create your event" },
				secondary: {
					href: `/e/${DEMO_EVENT_SLUG}/submit/cfp`,
					label: "Browse demo CFP",
				},
			};
		case "speaker":
			return {
				eyebrow: "Speaker",
				title: "Portal needs your invite",
				body: "The speaker portal is a magic-link email for people on your event. Demo fixture emails are not a public login.",
				primary: { href: "/admin", label: "Create your event" },
				secondary: {
					href: `/e/${DEMO_EVENT_SLUG}/speakers`,
					label: "Public speakers",
				},
			};
	}
}

export default async function DemoPage({ searchParams }: Props) {
	const params = await searchParams;
	const perspective = isPerspective(params.perspective) ? params.perspective : DEFAULT_PERSPECTIVE;
	const card = launcherFor(perspective);

	return (
		<main className="px-4 py-6 text-neutral-100 sm:px-6 sm:py-10">
			<div className="mx-auto max-w-3xl">
				<header className="border-b border-neutral-800 pb-6">
					<h1 className="text-balance text-3xl font-semibold tracking-tight sm:text-4xl">
						Demo
					</h1>
					<p className="mt-2 max-w-2xl text-pretty text-sm leading-6 text-neutral-400">
						Public CFP and schedule are real routes. Writes stay blocked.
						Review, accept, and the speaker portal need an event you create.
					</p>
					<nav aria-label="Demo perspective" className="mt-5 flex flex-wrap gap-2">
						{DEMO_PERSPECTIVES.map((item) => {
							const active = item.id === perspective;
							return (
								<Link
									key={item.id}
									href={`/demo?perspective=${item.id}`}
									aria-current={active ? "page" : undefined}
									className={
										active
											? "shrink-0 rounded-md bg-emerald-500 px-3 py-2 text-sm font-medium text-neutral-950"
											: "shrink-0 rounded-md border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm text-neutral-300 hover:bg-neutral-800"
									}
								>
									{item.label}
								</Link>
							);
						})}
					</nav>
				</header>

				<section className="mt-8 space-y-4 rounded-xl border border-neutral-800 bg-neutral-900/70 p-5 sm:p-6">
					<p className="text-sm font-medium text-emerald-400">{card.eyebrow}</p>
					<h2 className="text-2xl font-semibold tracking-tight">{card.title}</h2>
					<p className="text-pretty text-sm leading-6 text-neutral-400">{card.body}</p>
					{card.steps && card.steps.length > 0 ? (
						<ol className="list-decimal space-y-2 pl-5 text-sm leading-6 text-neutral-300">
							{card.steps.map((step) => (
								<li key={step}>{step}</li>
							))}
						</ol>
					) : null}
					<div className="flex flex-wrap gap-3 pt-2">
						<Link href={card.primary.href} className={buttonClasses("primary")}>
							{card.primary.label}
						</Link>
						{card.secondary ? (
							<Link href={card.secondary.href} className={buttonClasses("secondary")}>
								{card.secondary.label}
							</Link>
						) : null}
					</div>
				</section>
			</div>
		</main>
	);
}
