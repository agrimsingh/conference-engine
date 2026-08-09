"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AppNav } from "./app-nav";

type Props = {
	eventSlug: string;
};

export const ADMIN_EVENT_LINKS = [
	{ segment: "setup", label: "Setup" },
	{ segment: "settings", label: "Settings" },
	{ segment: "submissions", label: "Submissions" },
	{ segment: "review", label: "Review" },
	{ segment: "sessions", label: "Sessions" },
	{ segment: "content", label: "Content" },
	{ segment: "resources", label: "Resources" },
	{ segment: "integrations/accelevents", label: "Integrations" },
	{ segment: "files", label: "Files" },
	{ segment: "forms", label: "Forms" },
	{ segment: "schedule", label: "Schedule" },
	{ segment: "embeds", label: "Embeds" },
	{ segment: "dashboard", label: "Dashboard" },
	{ segment: "tasks", label: "Tasks" },
	{ segment: "speakers", label: "Speakers" },
	{ segment: "communications", label: "Comms" },
	{ segment: "team", label: "Team" },
] as const;

export function adminEventPath(eventSlug: string, segment: (typeof ADMIN_EVENT_LINKS)[number]["segment"]): string {
	return `/admin/events/${eventSlug}/${segment}`;
}

export function AdminEventNav({ eventSlug }: Props) {
	const pathname = usePathname();

	return (
		<AppNav ariaLabel="Event admin">
			{ADMIN_EVENT_LINKS.map((link) => {
				const href = adminEventPath(eventSlug, link.segment);
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
		</AppNav>
	);
}
