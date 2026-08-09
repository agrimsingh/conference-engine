export type TaskDueStatus = "pending" | "completed";

/** Pure due/overdue helpers. Pass `now` from the caller; never Date.now() inside. */
export function isTaskOverdue(args: {
	dueAt: number | null | undefined;
	status: TaskDueStatus;
	now: number;
}): boolean {
	return args.status === "pending" && typeof args.dueAt === "number" && args.dueAt < args.now;
}

export function formatTaskDueAt(dueAt: number, timeZone?: string): string {
	try {
		return new Intl.DateTimeFormat(undefined, {
			dateStyle: "medium",
			timeStyle: "short",
			...(timeZone ? { timeZone } : {}),
		}).format(new Date(dueAt));
	} catch {
		return new Date(dueAt).toISOString();
	}
}

export function taskDueLabel(args: {
	dueAt: number | null | undefined;
	status: TaskDueStatus;
	now: number;
	timeZone?: string;
}): string | null {
	if (typeof args.dueAt !== "number") return null;
	const when = formatTaskDueAt(args.dueAt, args.timeZone);
	return isTaskOverdue(args) ? `Overdue · ${when}` : `Due ${when}`;
}
