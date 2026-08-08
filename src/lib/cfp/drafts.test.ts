import { describe, expect, it } from "vitest";
import { finalizeDraft, issueDraftResumeToken } from "./drafts";

function replayDatabase(): D1Database {
	const statement = {
		bind: () => statement,
		first: async () => ({
			id: "draft-1", event_id: "event-1", form_id: "form-1", verified_email: "speaker@example.com", status: "submitted", submission_id: "draft-1",
		}),
	};
	return { prepare: () => statement } as unknown as D1Database;
}

describe("durable drafts", () => {
	it("never issues a resume token before a verified delivery", async () => {
		await expect(issueDraftResumeToken(replayDatabase(), { secret: "secret", draftId: "draft-1", deliveryVerified: false })).rejects.toThrow("verified delivery");
	});

	it("treats an already finalized draft as an idempotent replay", async () => {
		await expect(finalizeDraft(replayDatabase(), {
			secret: "secret", draftId: "draft-1", token: "resume", submitterName: "Speaker", answers: {}, speakers: [],
		})).resolves.toEqual({ submissionId: "draft-1", replay: true });
	});
});
