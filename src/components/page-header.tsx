import type { ReactNode } from "react";

type Props = {
	eyebrow: string;
	title: string;
	description?: ReactNode;
	children?: ReactNode;
};

export function PageHeader({ eyebrow, title, description, children }: Props) {
	return (
		<header className="mb-6 border-b border-neutral-800 pb-6 sm:mb-8">
			<p className="text-xs font-medium uppercase tracking-wide text-neutral-500">
				{eyebrow}
			</p>
			<h1 className="mt-2 text-balance text-2xl font-semibold tracking-tight text-neutral-100 sm:text-3xl">
				{title}
			</h1>
			{description ? (
				<div className="mt-2 max-w-2xl text-pretty text-sm leading-6 text-neutral-400">
					{description}
				</div>
			) : null}
			{children ? <div className="mt-4">{children}</div> : null}
		</header>
	);
}
