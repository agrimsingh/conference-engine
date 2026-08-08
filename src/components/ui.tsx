import type { ComponentPropsWithoutRef, ReactNode } from "react";
import type { CoSpeakerStatus } from "@/lib/domain";

export type ButtonVariant = "primary" | "secondary";
export type ButtonSize = "sm" | "md";

const BUTTON_VARIANT_CLASSES: Record<ButtonVariant, string> = {
	primary: "bg-emerald-500 text-neutral-950 hover:bg-emerald-400",
	secondary:
		"border border-neutral-800 bg-neutral-900 text-neutral-200 hover:bg-neutral-800",
};

const BUTTON_SIZE_CLASSES: Record<ButtonSize, string> = {
	sm: "px-3 py-1 text-xs",
	md: "px-3.5 py-1.5 text-sm",
};

export function buttonClasses(
	variant: ButtonVariant,
	size: ButtonSize = "md",
): string {
	return `rounded-md font-medium transition-colors disabled:opacity-40 ${BUTTON_SIZE_CLASSES[size]} ${BUTTON_VARIANT_CLASSES[variant]}`;
}

type ButtonProps = ComponentPropsWithoutRef<"button"> & {
	variant?: ButtonVariant;
	size?: ButtonSize;
};

export function Button({
	variant = "secondary",
	size = "md",
	className,
	type,
	...rest
}: ButtonProps) {
	return (
		<button
			type={type ?? "button"}
			className={`${buttonClasses(variant, size)}${className ? ` ${className}` : ""}`}
			{...rest}
		/>
	);
}

export type StatusTone = "neutral" | "positive" | "warning" | "negative";

const STATUS_TONE_CLASSES: Record<StatusTone, string> = {
	neutral: "border-neutral-700 bg-neutral-900 text-neutral-300",
	positive: "border-emerald-500/30 bg-emerald-500/10 text-emerald-400",
	warning: "border-amber-500/30 bg-amber-500/10 text-amber-400",
	negative: "border-red-500/30 bg-red-500/10 text-red-400",
};

export function StatusPill({
	tone = "neutral",
	children,
}: {
	tone?: StatusTone;
	children: ReactNode;
}) {
	return (
		<span
			className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide ${STATUS_TONE_CLASSES[tone]}`}
		>
			{children}
		</span>
	);
}

export function submissionStatusTone(status: string): StatusTone {
	switch (status) {
		case "accepted":
		case "scheduled":
		case "published":
			return "positive";
		case "waitlisted":
			return "warning";
		case "rejected":
		case "withdrawn":
			return "negative";
		default:
			return "neutral";
	}
}

export function coSpeakerStatusTone(status: CoSpeakerStatus): StatusTone {
	switch (status) {
		case "confirmed":
			return "positive";
		case "pending":
			return "warning";
		// One Red Rule: declined/removed are outcomes, not errors.
		case "declined":
		case "removed":
			return "neutral";
		default: {
			const _exhaustive: never = status;
			return _exhaustive;
		}
	}
}

export function Chip({ children }: { children: ReactNode }) {
	return (
		<span className="inline-flex items-center gap-1 rounded-md border border-neutral-700 bg-neutral-900 px-2 py-0.5 text-xs text-neutral-300">
			{children}
		</span>
	);
}

export const SEGMENTED_CONTAINER_CLASSES =
	"inline-flex w-fit flex-wrap rounded-lg border border-neutral-800 bg-neutral-900 p-0.5";

export function segmentedItemClasses(active: boolean): string {
	return active
		? "rounded-md bg-neutral-800 px-3 py-1 text-sm font-medium text-neutral-100"
		: "rounded-md px-3 py-1 text-sm text-neutral-400 hover:text-neutral-100";
}

export function SegmentedControl<T extends string>({
	value,
	options,
	onChange,
	label,
}: {
	value: T;
	options: readonly { value: T; label: string }[];
	onChange: (value: T) => void;
	label?: string;
}) {
	return (
		<div className={SEGMENTED_CONTAINER_CLASSES} role="group" aria-label={label}>
			{options.map((option) => (
				<button
					key={option.value}
					type="button"
					className={segmentedItemClasses(option.value === value)}
					onClick={() => onChange(option.value)}
				>
					{option.label}
				</button>
			))}
		</div>
	);
}

export function EmptyState({
	title,
	description,
	children,
}: {
	title: string;
	description?: ReactNode;
	children?: ReactNode;
}) {
	return (
		<div className="rounded-lg border border-dashed border-neutral-700 px-4 py-10 text-center">
			<p className="text-sm font-medium text-neutral-100">{title}</p>
			{description ? (
				<p className="mt-1 text-sm text-neutral-400">{description}</p>
			) : null}
			{children}
		</div>
	);
}

export const INPUT_CLASSES =
	"rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-500";

export type NoticeTone = "positive" | "warning" | "negative";

const NOTICE_TONE_CLASSES: Record<NoticeTone, string> = {
	positive: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
	warning: "border-amber-500/30 bg-amber-500/10 text-amber-300",
	negative: "border-red-500/30 bg-red-500/10 text-red-300",
};

export function noticeClasses(tone: NoticeTone): string {
	return `rounded-md border px-3 py-2 text-sm ${NOTICE_TONE_CLASSES[tone]}`;
}
