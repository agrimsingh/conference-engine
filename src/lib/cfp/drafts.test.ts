import { describe, expect, it } from "vitest";
import { isSubmissionLimitReachedError, validateSubmitterIdentity } from "./submit";
import { finalizeDraft, issueDraftResumeToken, loadDraftForResume, prepareDraftResumeDelivery } from "./drafts";

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

	it("prepares draft and hashed token together before email delivery", async () => {
		const statements: Array<{ sql: string; values: unknown[] }> = [];
		const db = {
			prepare: (sql: string) => ({ bind: (...values: unknown[]) => ({
				sql,
				values,
				first: async () => sql.includes("SELECT * FROM events")
					? { id: "event-1", slug: "event", name: "Event", timezone: "UTC", mode: "live", created_at: 0, updated_at: 0 }
					: null,
			}) }),
			batch: async (batch: Array<{ sql: string; values: unknown[] }>) => { statements.push(...batch); return []; },
		} as unknown as D1Database;
		const prepared = await prepareDraftResumeDelivery(db, {
			secret: "secret", eventId: "event-1", formId: "form-1", verifiedEmail: "speaker@example.com", draftId: "draft-1", token: "resume-token", now: 1,
		});
		expect(prepared).toEqual({ draftId: "draft-1", token: "resume-token" });
		expect(statements).toHaveLength(2);
		expect(statements[0].sql).toContain("INSERT INTO submission_drafts");
		expect(statements[1].sql).toContain("INSERT INTO submission_draft_tokens");
		expect(statements[1].values).not.toContain("resume-token");
	});

	it("treats an already finalized draft as an idempotent replay", async () => {
		await expect(finalizeDraft(replayDatabase(), {
			secret: "secret", draftId: "draft-1", token: "resume", submitterName: "Speaker", answers: {}, speakers: [],
		})).resolves.toEqual({ submissionId: "draft-1", replay: true });
	});

	it("recognizes the database limit guard for a deliberate conflict response", () => {
		expect(isSubmissionLimitReachedError(new Error("D1_ERROR: submission limit reached"))).toBe(true);
		expect(isSubmissionLimitReachedError(new Error("constraint failed"))).toBe(false);
	});

	it("restores the verified email and submitter name with saved answers", async () => {
		const statement = {
			bind: () => statement,
			first: async () => ({
				id: "draft-1", event_id: "event-1", form_id: "form-1",
				verified_email: "speaker@example.com", submitter_name: "Speaker Name",
				status: "draft", answers_json: '{"title":"Saved talk"}', submission_id: null,
			}),
		};
		const db = { prepare: () => statement } as unknown as D1Database;
		await expect(loadDraftForResume(db, { secret: "secret", token: "resume" })).resolves.toMatchObject({
			verifiedEmail: "speaker@example.com", submitterName: "Speaker Name", answers: { title: "Saved talk" },
		});
	});
});

describe("submitter identity validation", () => {
	it("normalizes valid identity and rejects malformed or oversized values", () => {
		expect(validateSubmitterIdentity({ name: " Ada ", email: "ADA@EXAMPLE.COM" })).toEqual({ ok: true, name: "Ada", email: "ada@example.com" });
		expect(validateSubmitterIdentity({ name: "", email: "not-an-email" }).ok).toBe(false);
		expect(validateSubmitterIdentity({ name: "a".repeat(161), email: "ada@example.com" }).ok).toBe(false);
	});
});
