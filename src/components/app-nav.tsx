import Link from "next/link";
import type { ReactNode } from "react";
import { LogoMark } from "./logo";

export function AppNav({
	children,
	ariaLabel,
}: {
	children?: ReactNode;
	ariaLabel?: string;
}) {
	return (
		<header className="sticky top-0 z-40 border-b border-neutral-800 bg-neutral-950/90 backdrop-blur-md">
			<nav
				aria-label={ariaLabel}
				className="mx-auto flex min-h-14 max-w-6xl items-center gap-3 px-4 sm:px-6"
			>
				<Link href="/" className="flex shrink-0 items-center gap-2 rounded-md">
					<LogoMark />
					<span className="text-sm font-semibold tracking-tight text-neutral-100 max-[360px]:hidden">
						conference-engine
					</span>
				</Link>
				{children}
			</nav>
		</header>
	);
}
