export const SCHEDULE_ACTIONS = ["unplace", "publish", "unpublish"] as const;
export type ScheduleAction = (typeof SCHEDULE_ACTIONS)[number];

export function isScheduleAction(value: unknown): value is ScheduleAction {
	return typeof value === "string" && (SCHEDULE_ACTIONS as readonly string[]).includes(value);
}
