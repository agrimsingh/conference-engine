"use client";

import { useDraggable, useDroppable } from "@dnd-kit/core";
import type { CSSProperties, KeyboardEvent, ReactNode } from "react";
import type { ScheduleSession } from "./schedule-types";

const SLOT_PREFIX = "slot:";

export function slotDroppableId(roomName: string, startMinutes: number): string {
	return `${SLOT_PREFIX}${encodeURIComponent(roomName)}:${startMinutes}`;
}

export function parseSlotDroppableId(
	id: string | number | undefined | null,
): { roomName: string; startMinutes: number } | null {
	if (typeof id !== "string" || !id.startsWith(SLOT_PREFIX)) return null;
	const rest = id.slice(SLOT_PREFIX.length);
	const colon = rest.lastIndexOf(":");
	if (colon <= 0) return null;
	const roomName = decodeURIComponent(rest.slice(0, colon));
	const startMinutes = Number(rest.slice(colon + 1));
	if (!roomName || !Number.isFinite(startMinutes)) return null;
	return { roomName, startMinutes };
}

type UnplacedChipProps = {
	session: ScheduleSession;
	selected: boolean;
	onSelect: () => void;
};

export function UnplacedDraggableChip({ session, selected, onSelect }: UnplacedChipProps) {
	const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
		id: session.id,
		data: { sessionId: session.id, kind: "session" as const },
	});
	const style: CSSProperties = {
		opacity: isDragging ? 0.35 : 1,
	};

	return (
		<li>
			<button
				ref={setNodeRef}
				type="button"
				style={style}
				{...listeners}
				{...attributes}
				onClick={onSelect}
				className={`max-w-xs cursor-grab rounded-md border px-3 py-2 text-left text-sm active:cursor-grabbing ${
					selected
						? "border-emerald-500/60 bg-neutral-800 text-neutral-100"
						: "border-neutral-700 bg-neutral-950/60 text-neutral-200 hover:border-neutral-500"
				}`}
				aria-pressed={selected}
			>
				<p className="font-medium">{session.title}</p>
				<p className="mt-0.5 text-xs opacity-80">
					{session.durationMinutes}m · {session.status}
					{session.speakerLabels.length ? ` · ${session.speakerLabels.join(", ")}` : ""}
				</p>
			</button>
		</li>
	);
}

type PlacedCardProps = {
	session: ScheduleSession;
	selected: boolean;
	minHeightRem: number;
	timeLabel: string;
	onSelect: () => void;
	onKeyDown: (event: KeyboardEvent<HTMLElement>) => void;
};

export function PlacedDraggableCard({
	session,
	selected,
	minHeightRem,
	timeLabel,
	onSelect,
	onKeyDown,
}: PlacedCardProps) {
	const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
		id: session.id,
		data: { sessionId: session.id, kind: "session" as const },
	});
	const style: CSSProperties = {
		opacity: isDragging ? 0.35 : 1,
		minHeight: `${minHeightRem}rem`,
	};

	const speakers =
		session.speakerLabels.length === 0
			? null
			: session.speakerLabels.length <= 2
				? session.speakerLabels.join(", ")
				: `${session.speakerLabels.slice(0, 2).join(", ")} +${session.speakerLabels.length - 2}`;

	return (
		<div
			ref={setNodeRef}
			style={style}
			{...listeners}
			{...attributes}
			role="button"
			tabIndex={0}
			aria-label={`Move ${session.title}${speakers ? `, ${speakers}` : ""}; press Enter then choose a schedule cell`}
			aria-pressed={selected}
			onKeyDown={onKeyDown}
			onClick={onSelect}
			className="m-0.5 box-border h-full w-full cursor-grab rounded-md border border-neutral-700 bg-neutral-800 px-2 py-1 text-xs text-neutral-100 active:cursor-grabbing"
		>
			<p className="line-clamp-3 font-medium leading-snug">{session.title}</p>
			{speakers ? (
				<p className="mt-0.5 truncate text-[11px] text-neutral-300">{speakers}</p>
			) : null}
			<p className="mt-0.5 font-mono tabular-nums text-[11px] text-neutral-400">
				{timeLabel}
			</p>
		</div>
	);
}

type SlotProps = {
	id: string;
	ariaLabel: string;
	isOver: boolean;
	onClick: () => void;
};

export function DroppableSlot({ id, ariaLabel, isOver, onClick }: SlotProps) {
	const { setNodeRef, isOver: droppableOver } = useDroppable({
		id,
		data: { kind: "slot" as const },
	});
	const active = isOver || droppableOver;

	return (
		<button
			ref={setNodeRef}
			type="button"
			onClick={onClick}
			aria-label={ariaLabel}
			className={`flex h-10 w-full items-stretch border ${
				active
					? "border-emerald-500/70 bg-emerald-950/40"
					: "border-transparent hover:border-neutral-600 hover:bg-neutral-800/40"
			}`}
		/>
	);
}

type OverlayProps = {
	session: ScheduleSession | null;
	children?: ReactNode;
};

export function SessionDragOverlay({ session }: OverlayProps) {
	if (!session) return null;
	return (
		<div className="max-w-xs cursor-grabbing rounded-md border border-emerald-500/50 bg-neutral-800 px-3 py-2 text-left text-sm text-neutral-100 shadow-lg shadow-black/40">
			<p className="font-medium">{session.title}</p>
			<p className="mt-0.5 text-xs opacity-80">
				{session.durationMinutes}m
				{session.speakerLabels.length ? ` · ${session.speakerLabels.join(", ")}` : ""}
			</p>
		</div>
	);
}
