import { describe, expect, it, vi } from "vitest";
import type { DecideResult } from "./decide";
import { notifyDecidedSubmissions } from "./notify-decided";

describe("notifyDecidedSubmissions", () => {
	it("reuses decide with matching action and requires send:true email", async () => {
		const decide = vi.fn(
			async (
				submissionId: string,
				action: string,
				email: { send: boolean },
			): Promise<DecideResult> => {
				expect(action).toBe("reject");
				expect(email).toEqual({
					send: true,
					subject: "No",
					text: "Declined",
				});
				return { ok: true, submissionId, status: "rejected", email: null };
			},
		);
		const db = {
			prepare: () => ({
				bind: () => ({
					first: async () => ({
						id: "sub-1",
						event_id: "evt-1",
						status: "rejected",
					}),
				}),
			}),
		} as unknown as D1Database;

		const result = await notifyDecidedSubmissions(db, {
			eventId: "evt-1",
			submissionIds: ["sub-1"],
			email: { send: true, subject: "No", text: "Declined" },
			decide,
		});
		expect(result).toMatchObject({ succeeded: 1, failed: 0 });
		expect(decide).toHaveBeenCalledOnce();
	});

	it("rejects non-decided statuses", async () => {
		const decide = vi.fn();
		const db = {
			prepare: () => ({
				bind: () => ({
					first: async () => ({
						id: "sub-2",
						event_id: "evt-1",
						status: "submitted",
					}),
				}),
			}),
		} as unknown as D1Database;

		const result = await notifyDecidedSubmissions(db, {
			eventId: "evt-1",
			submissionIds: ["sub-2"],
			email: { send: true, subject: "Hi", text: "Body" },
			decide,
		});
		expect(result.failed).toBe(1);
		expect(result.outcomes[0]).toMatchObject({
			ok: false,
			error: "Cannot notify from submitted",
		});
		expect(decide).not.toHaveBeenCalled();
	});
});
