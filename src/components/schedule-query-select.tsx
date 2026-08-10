"use client";

import { useRouter } from "next/navigation";

const SELECT_CLASSES =
	"mt-1.5 block w-full rounded-md border border-neutral-700 bg-neutral-900 px-2.5 py-1.5 text-sm text-neutral-100";

const LABEL_CLASSES =
	"block w-full text-xs font-medium uppercase tracking-wide text-neutral-500 sm:w-auto sm:min-w-[9rem]";

export function ScheduleQuerySelect({
	label,
	value,
	options,
}: {
	label: string;
	value: string;
	options: Array<{ value: string; label: string; href: string }>;
}) {
	const router = useRouter();

	return (
		<label className={LABEL_CLASSES}>
			{label}
			<select
				value={value}
				onChange={(event) => {
					const next = options.find((option) => option.value === event.target.value);
					if (next) router.push(next.href);
				}}
				className={SELECT_CLASSES}
			>
				{options.map((option) => (
					<option key={option.value} value={option.value}>
						{option.label}
					</option>
				))}
			</select>
		</label>
	);
}

export function DiscoverFacetSelect({
	label,
	value,
	options,
	onChange,
	allLabel = "All",
}: {
	label: string;
	value: string;
	options: string[];
	onChange: (next: string) => void;
	allLabel?: string;
}) {
	return (
		<label className={LABEL_CLASSES}>
			{label}
			<select
				value={value}
				onChange={(event) => onChange(event.target.value)}
				className={SELECT_CLASSES}
			>
				<option value="all">{allLabel}</option>
				{options.map((option) => (
					<option key={option} value={option}>
						{option}
					</option>
				))}
			</select>
		</label>
	);
}
