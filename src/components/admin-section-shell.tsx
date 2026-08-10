"use client";

import type { ReactNode } from "react";
import { INPUT_CLASSES } from "@/components/ui";

export type AdminSectionItem<T extends string> = {
	id: T;
	label: string;
	description: string;
};

type Props<T extends string> = {
	ariaLabel: string;
	mobileLabel: string;
	sections: ReadonlyArray<AdminSectionItem<T>>;
	section: T;
	onSectionChange: (next: T) => void;
	notice?: ReactNode;
	children: ReactNode;
};

export function AdminSectionShell<T extends string>({
	ariaLabel,
	mobileLabel,
	sections,
	section,
	onSectionChange,
	notice,
	children,
}: Props<T>) {
	const active = sections.find((item) => item.id === section) ?? sections[0]!;

	return (
		<div className="mt-8 lg:grid lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-8">
			<aside className="mb-6 lg:mb-0">
				<label className="mb-2 block text-xs font-medium uppercase tracking-wide text-neutral-500 lg:hidden">
					{mobileLabel}
					<select
						value={section}
						onChange={(event) => onSectionChange(event.target.value as T)}
						className={`mt-1.5 w-full ${INPUT_CLASSES}`}
					>
						{sections.map((item) => (
							<option key={item.id} value={item.id}>
								{item.label}
							</option>
						))}
					</select>
				</label>
				<nav aria-label={ariaLabel} className="hidden lg:sticky lg:top-20 lg:block">
					<ul className="space-y-1 border-l border-neutral-800">
						{sections.map((item) => {
							const selected = item.id === section;
							return (
								<li key={item.id}>
									<button
										type="button"
										onClick={() => onSectionChange(item.id)}
										aria-current={selected ? "page" : undefined}
										className={
											selected
												? "-ml-px border-l-2 border-neutral-100 py-2 pl-4 text-left text-sm font-medium text-neutral-100"
												: "-ml-px border-l-2 border-transparent py-2 pl-4 text-left text-sm text-neutral-500 hover:border-neutral-600 hover:text-neutral-200"
										}
									>
										{item.label}
									</button>
								</li>
							);
						})}
					</ul>
				</nav>
			</aside>

			<div className="min-w-0 space-y-4">
				{notice}
				<header className="mb-2 border-b border-neutral-800 pb-4">
					<h2 className="text-lg font-semibold text-neutral-100">{active.label}</h2>
					<p className="mt-1 text-sm text-neutral-400">{active.description}</p>
				</header>
				{children}
			</div>
		</div>
	);
}
