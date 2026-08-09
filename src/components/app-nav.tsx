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
		<header className="sticky top-0 z-40 border-b border-neutral-800 bg-neutral-950/80 backdrop-blur">
			<nav
				aria-label={ariaLabel}
				className="mx-auto flex min-h-12 max-w-6xl flex-nowrap items-center gap-3 overflow-x-auto px-4 py-2 whitespace-nowrap"
			>
				<Link href="/" className="mr-2 flex shrink-0 items-center gap-2">
					<LogoMark />
					<span className="text-sm font-semibold tracking-tight text-neutral-100">
						conference-engine
					</span>
				</Link>
				{children}
			</nav>
		</header>
	);
}
