"use client";

import { useState } from "react";
import { truncatePreview } from "@/lib/schedule/public-discover";

export function ShowMoreText({
	text,
	maxChars = 180,
	className = "whitespace-pre-wrap text-sm leading-6 text-neutral-400",
}: {
	text: string;
	maxChars?: number;
	className?: string;
}) {
	const [expanded, setExpanded] = useState(false);
	const trimmed = text.trim();
	if (!trimmed) return null;

	const { preview, truncated } = truncatePreview(trimmed, maxChars);
	const body = expanded || !truncated ? trimmed : preview;

	return (
		<div>
			<p className={className}>{body}</p>
			{truncated ? (
				<button
					type="button"
					className="mt-1 text-sm font-medium text-neutral-200 underline underline-offset-2 hover:text-neutral-100"
					onClick={() => setExpanded((value) => !value)}
					aria-expanded={expanded}
				>
					{expanded ? "Show less" : "Show more"}
				</button>
			) : null}
		</div>
	);
}
