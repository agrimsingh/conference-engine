"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { AppNav } from "./app-nav";

type Props = {
	eventSlug: string;
};

export const ADMIN_EVENT_GROUPS = [
	{
		label: "Overview",
		links: [
			{ segment: "dashboard", label: "Dashboard" },
			{ segment: "setup", label: "Setup" },
		],
	},
	{
		label: "Program",
		links: [
			{ segment: "submissions", label: "Submissions" },
			{ segment: "review", label: "Review" },
			{ segment: "sessions", label: "Sessions" },
			{ segment: "schedule", label: "Schedule" },
		],
	},
	{
		label: "Speakers",
		links: [
			{ segment: "speakers", label: "Speakers" },
			{ segment: "tasks", label: "Tasks" },
			{ segment: "content", label: "Content" },
			{ segment: "files", label: "Files" },
			{ segment: "communications", label: "Comms" },
			{ segment: "resources", label: "Resources" },
		],
	},
	{
		label: "Manage",
		links: [
			{ segment: "forms", label: "Forms" },
			{ segment: "settings", label: "Settings" },
			{ segment: "embeds", label: "Embeds" },
			{ segment: "integrations/accelevents", label: "Integrations" },
		],
	},
] as const;

type AdminEventLink = (typeof ADMIN_EVENT_GROUPS)[number]["links"][number];

export const ADMIN_EVENT_LINKS: readonly AdminEventLink[] =
	ADMIN_EVENT_GROUPS.reduce<AdminEventLink[]>(
		(links, group) => [...links, ...group.links],
		[],
	);

export function adminEventPath(
	eventSlug: string,
	segment: AdminEventLink["segment"],
): string {
	return `/admin/events/${eventSlug}/${segment}`;
}

function ChevronIcon() {
	return (
		<svg
			aria-hidden="true"
			viewBox="0 0 16 16"
			className="size-3.5 fill-none stroke-current"
			strokeWidth="1.5"
		>
			<path d="m4 6 4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
		</svg>
	);
}

function isActivePath(pathname: string, href: string): boolean {
	return pathname === href || pathname.startsWith(`${href}/`);
}

export function AdminEventNav({ eventSlug }: Props) {
	const pathname = usePathname();
	const navRef = useRef<HTMLDivElement>(null);
	const [openMenu, setOpenMenu] = useState<string | null>(null);
	const currentLink = ADMIN_EVENT_LINKS.find((link) =>
		isActivePath(pathname, adminEventPath(eventSlug, link.segment)),
	);

	useEffect(() => {
		function closeOnOutsideClick(event: PointerEvent) {
			if (!navRef.current?.contains(event.target as Node)) setOpenMenu(null);
		}

		function closeOnEscape(event: KeyboardEvent) {
			if (event.key === "Escape") setOpenMenu(null);
		}

		document.addEventListener("pointerdown", closeOnOutsideClick);
		document.addEventListener("keydown", closeOnEscape);
		return () => {
			document.removeEventListener("pointerdown", closeOnOutsideClick);
			document.removeEventListener("keydown", closeOnEscape);
		};
	}, []);

	return (
		<AppNav ariaLabel="Event admin">
			<div ref={navRef} className="contents">
				<div className="ml-2 hidden items-center gap-1 lg:flex">
					{ADMIN_EVENT_GROUPS.map((group) => {
						const groupActive = group.links.some((link) =>
							isActivePath(pathname, adminEventPath(eventSlug, link.segment)),
						);
						const expanded = openMenu === group.label;
						return (
							<div key={group.label} className="relative">
								<button
									type="button"
									aria-expanded={expanded}
									aria-controls={`admin-nav-${group.label.toLowerCase()}`}
									onClick={() => setOpenMenu(expanded ? null : group.label)}
									className={`flex cursor-pointer list-none items-center gap-1 rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors [&::-webkit-details-marker]:hidden ${
										groupActive
											? "bg-neutral-800 text-neutral-100"
											: "text-neutral-400 hover:bg-neutral-900 hover:text-neutral-100"
									}`}
								>
									<span>{group.label}</span>
									{groupActive && currentLink ? (
										<span className="text-neutral-400">
											· {currentLink.label}
										</span>
									) : null}
									<span
										className={`transition-transform ${expanded ? "rotate-180" : ""}`}
									>
										<ChevronIcon />
									</span>
								</button>
								{expanded ? (
									<div
										id={`admin-nav-${group.label.toLowerCase()}`}
										className="absolute left-0 top-[calc(100%+0.5rem)] z-50 w-56 rounded-lg border border-neutral-800 bg-neutral-900 p-1.5 shadow-xl shadow-black/30"
									>
										{group.links.map((link) => {
											const href = adminEventPath(eventSlug, link.segment);
											const active = isActivePath(pathname, href);
											return (
												<Link
													key={link.segment}
													href={href}
													aria-current={active ? "page" : undefined}
													onClick={() => setOpenMenu(null)}
													className={`block rounded-md px-3 py-2 text-sm transition-colors ${
														active
															? "bg-neutral-800 text-neutral-100"
															: "text-neutral-400 hover:bg-neutral-800 hover:text-neutral-100"
													}`}
												>
													{link.label}
												</Link>
											);
										})}
									</div>
								) : null}
							</div>
						);
					})}
				</div>

				<div className="ml-auto hidden items-center gap-1 lg:flex">
					<Link
						href="/admin"
						className="rounded-md px-2.5 py-1.5 text-sm text-neutral-500 transition-colors hover:bg-neutral-900 hover:text-neutral-100"
					>
						All events
					</Link>
					<Link
						href={`/e/${eventSlug}/schedule`}
						className="rounded-md border border-neutral-800 bg-neutral-900 px-2.5 py-1.5 text-sm font-medium text-neutral-200 transition-colors hover:bg-neutral-800"
					>
						View public
					</Link>
				</div>

				<div className="relative ml-auto lg:hidden">
					<button
						type="button"
						aria-expanded={openMenu === "mobile"}
						aria-controls="admin-nav-mobile"
						onClick={() => setOpenMenu(openMenu === "mobile" ? null : "mobile")}
						className="flex cursor-pointer list-none items-center gap-1.5 rounded-md border border-neutral-800 bg-neutral-900 px-3 py-1.5 text-sm font-medium text-neutral-200 transition-colors hover:bg-neutral-800 [&::-webkit-details-marker]:hidden"
					>
						<span className="max-w-32 truncate">
							{currentLink?.label ?? "Event menu"}
						</span>
						<span
							className={`transition-transform ${openMenu === "mobile" ? "rotate-180" : ""}`}
						>
							<ChevronIcon />
						</span>
					</button>
					{openMenu === "mobile" ? (
						<div
							id="admin-nav-mobile"
							className="absolute right-0 top-[calc(100%+0.5rem)] z-50 max-h-[calc(100dvh-5rem)] w-[min(22rem,calc(100vw-2rem))] overflow-y-auto rounded-lg border border-neutral-800 bg-neutral-900 p-3 shadow-xl shadow-black/30"
						>
							<div className="grid grid-cols-2 gap-x-4 gap-y-5">
								{ADMIN_EVENT_GROUPS.map((group) => (
									<section key={group.label}>
										<p className="px-2 text-xs font-medium uppercase tracking-wide text-neutral-500">
											{group.label}
										</p>
										<div className="mt-1">
											{group.links.map((link) => {
												const href = adminEventPath(eventSlug, link.segment);
												const active = isActivePath(pathname, href);
												return (
													<Link
														key={link.segment}
														href={href}
														aria-current={active ? "page" : undefined}
														onClick={() => setOpenMenu(null)}
														className={`block rounded-md px-2 py-1.5 text-sm transition-colors ${active ? "bg-neutral-800 text-neutral-100" : "text-neutral-400 hover:bg-neutral-800 hover:text-neutral-100"}`}
													>
														{link.label}
													</Link>
												);
											})}
										</div>
									</section>
								))}
							</div>
							<div className="mt-3 grid grid-cols-2 gap-2 border-t border-neutral-800 pt-3">
								<Link
									href="/admin"
									className="rounded-md px-2 py-2 text-center text-sm text-neutral-400 transition-colors hover:bg-neutral-800 hover:text-neutral-100"
								>
									All events
								</Link>
								<Link
									href={`/e/${eventSlug}/schedule`}
									className="rounded-md bg-neutral-800 px-2 py-2 text-center text-sm font-medium text-neutral-100 transition-colors hover:bg-neutral-700"
								>
									View public
								</Link>
							</div>
						</div>
					) : null}
				</div>
			</div>
		</AppNav>
	);
}
