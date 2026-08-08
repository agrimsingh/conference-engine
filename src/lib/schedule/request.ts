import { isJsonObject, readBoundedJson } from "@/lib/cfp/request";

export const MAX_SCHEDULE_REQUEST_BYTES = 16 * 1024;

export type ScheduleJsonResult =
	| { ok: true; body: Record<string, unknown> }
	| { ok: false; status: 400 | 413; error: string };

export async function readScheduleJson(request: Request): Promise<ScheduleJsonResult> {
	const parsed = await readBoundedJson(request, MAX_SCHEDULE_REQUEST_BYTES);
	if (!parsed.ok) return parsed;
	if (!isJsonObject(parsed.value)) return { ok: false, status: 400, error: "Expected JSON object" };
	return { ok: true, body: parsed.value };
}
