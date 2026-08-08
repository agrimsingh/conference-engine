"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AppNav } from "./app-nav";

type Props = {
	eventSlug: string;
};

const LINKS = [
	{ segment: "submissions", label: "Submissions" },
	{ segment: "forms", label: "Forms" },
	{ segment: "schedule", label: "Schedule" },
	{ segment: "dashboard", label: "Dashboard" },
	{ segment: "tasks", label: "Tasks" },
	{ segment: "team", label: "Team" },
] as const;

export function AdminEventNav({ eventSlug }: Props) {
	const pathname = usePathname();
	const base = `/admin/events/${eventSlug}`;

	return (
		<AppNav ariaLabel="Event admin">
			{LINKS.map((link) => {
				const href = `${base}/${link.segment}`;
				const active = pathname === href || pathname.startsWith(`${href}/`);
				return (
					<Link
						key={link.segment}
						href={href}
						aria-current={active ? "page" : undefined}
						className={
							active
								? "rounded-md bg-neutral-800 px-2.5 py-1 text-xs font-medium text-neutral-100"
								: "rounded-md px-2.5 py-1 text-xs font-medium text-neutral-400 hover:bg-neutral-900 hover:text-neutral-100"
						}
					>
						{link.label}
					</Link>
				);
			})}
			<span className="mx-1 hidden h-4 w-px bg-neutral-800 sm:inline" aria-hidden />
			<Link
				href="/admin"
				className="rounded-md px-2.5 py-1 text-xs font-medium text-neutral-500 hover:bg-neutral-900 hover:text-neutral-100"
			>
				All events
			</Link>
			<span className="mx-1 hidden h-4 w-px bg-neutral-800 sm:inline" aria-hidden />
			<Link
				href={`/e/${eventSlug}/schedule`}
				className="rounded-md px-2.5 py-1 text-xs font-medium text-neutral-500 hover:bg-neutral-900 hover:text-neutral-100"
			>
				Public schedule
			</Link>
			<Link
				href={`/review?event=${eventSlug}`}
				className="rounded-md px-2.5 py-1 text-xs font-medium text-neutral-500 hover:bg-neutral-900 hover:text-neutral-100"
			>
				Review board
			</Link>
		</AppNav>
	);
}
