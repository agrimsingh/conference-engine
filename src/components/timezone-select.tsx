"use client";

import { INPUT_CLASSES } from "@/components/ui";
import { timeZoneOptions } from "@/lib/timezones";

type Props = {
	id?: string;
	name?: string;
	value?: string;
	defaultValue?: string;
	required?: boolean;
	disabled?: boolean;
	className?: string;
	onChange?: (timezone: string) => void;
};

export function TimezoneSelect({
	id,
	name,
	value,
	defaultValue,
	required,
	disabled,
	className,
	onChange,
}: Props) {
	const options = timeZoneOptions(value ?? defaultValue);

	return (
		<select
			id={id}
			name={name}
			required={required}
			disabled={disabled}
			value={value}
			defaultValue={value === undefined ? defaultValue : undefined}
			onChange={
				onChange
					? (event) => onChange(event.target.value)
					: undefined
			}
			className={className ?? `w-full ${INPUT_CLASSES}`}
		>
			{options.map((zone) => (
				<option key={zone} value={zone}>
					{zone.replaceAll("_", " ")}
				</option>
			))}
		</select>
	);
}
