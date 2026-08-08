import type { ReactNode } from "react";

type Props = {
	eyebrow: string;
	title: string;
	description?: ReactNode;
	children?: ReactNode;
};

export function PageHeader({ eyebrow, title, description, children }: Props) {
	return (
		<header className="mb-8 space-y-2 border-b border-neutral-800 pb-5">
			<p className="text-xs font-medium uppercase tracking-wide text-neutral-500">
				{eyebrow}
			</p>
			<h1 className="text-balance text-3xl font-semibold tracking-tight text-neutral-100">
				{title}
			</h1>
			{description ? (
				<div className="max-w-2xl text-pretty text-sm text-neutral-400">
					{description}
				</div>
			) : null}
			{children}
		</header>
	);
}
