"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type Props = {
	eventSlug: string;
};

const LINKS = [
	{ segment: "submissions", label: "Submissions" },
	{ segment: "schedule", label: "Schedule" },
	{ segment: "dashboard", label: "Dashboard" },
	{ segment: "tasks", label: "Tasks" },
] as const;

export function AdminEventNav({ eventSlug }: Props) {
	const pathname = usePathname();
	const base = `/admin/events/${eventSlug}`;

	return (
		<nav
			aria-label="Event admin"
			className="border-b border-neutral-200 bg-white"
		>
			<div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-1 gap-y-2 px-4 py-2.5 text-sm">
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
									? "rounded-md bg-neutral-900 px-2.5 py-1 text-xs font-medium text-white"
									: "rounded-md px-2.5 py-1 text-xs font-medium text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900"
							}
						>
							{link.label}
						</Link>
					);
				})}
				<span className="mx-1 hidden h-4 w-px bg-neutral-200 sm:inline" aria-hidden />
				<Link
					href={`/e/${eventSlug}/schedule`}
					className="rounded-md px-2.5 py-1 text-xs font-medium text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900"
				>
					Public schedule
				</Link>
				<Link
					href={`/review?event=${eventSlug}`}
					className="rounded-md px-2.5 py-1 text-xs font-medium text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900"
				>
					Review board
				</Link>
			</div>
		</nav>
	);
}
