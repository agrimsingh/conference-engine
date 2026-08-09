export type TaskDueStatus = "pending" | "completed";

/** Pure due/overdue helpers. Pass `now` from the caller; never Date.now() inside. */
export function isTaskOverdue(args: {
	dueAt: number | null | undefined;
	status: TaskDueStatus;
	now: number;
}): boolean {
	return args.status === "pending" && typeof args.dueAt === "number" && args.dueAt < args.now;
}

export function formatTaskDueAt(dueAt: number, _timeZone?: string): string {
	try {
		return new Intl.DateTimeFormat("en-US", {
			dateStyle: "medium",
			timeZone: "UTC",
		}).format(new Date(dueAt));
	} catch {
		return new Date(dueAt).toISOString().slice(0, 10);
	}
}

export function formatUtcTimestamp(value: number): string {
	return new Date(value).toISOString().replace("T", " ").slice(0, 16) + " UTC";
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
