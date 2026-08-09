import { describe, expect, it } from "vitest";
import { isSubmissionLimitReachedError, validateSubmitterIdentity } from "./submit";
import { finalizeDraft, issueDraftResumeToken, loadDraftForResume, prepareDraftResumeDelivery, SubmissionNotEditableError } from "./drafts";

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

	it("updates an already finalized draft in place when still submitted", async () => {
		const statements: Array<{ sql: string }> = [];
		const db = {
			prepare: (sql: string) => ({
				bind: () => ({
					sql,
					first: async () => {
						if (sql.includes("FROM submissions")) return { status: "submitted" };
						if (sql.includes("FROM submission_drafts d") || sql.includes("JOIN submission_draft_tokens")) {
							return {
								id: "draft-1", event_id: "event-1", form_id: "form-1", verified_email: "speaker@example.com",
								status: "submitted", submission_id: "draft-1",
							};
						}
						if (sql.includes("SELECT * FROM events") || sql.includes("FROM events")) {
							return { id: "event-1", slug: "event", name: "Event", timezone: "UTC", mode: "live", created_at: 0, updated_at: 0 };
						}
						return null;
					},
				}),
			}),
			batch: async (batch: Array<{ sql: string; meta?: { changes: number } }>) => {
				statements.push(...batch);
				return batch.map((item) => ({
					...item,
					meta: { changes: item.sql.includes("UPDATE submissions") ? 1 : 1 },
				}));
			},
		} as unknown as D1Database;
		const result = await finalizeDraft(db, {
			secret: "secret", draftId: "draft-1", token: "resume", submitterName: "Speaker", answers: { title: "Revised" }, speakers: [{ name: "Speaker", email: "speaker@example.com" }],
		});
		expect(result.submissionId).toBe("draft-1");
		expect(result.replay).toBe(false);
		expect(result.outcome).toBe("updated");
		expect(result.editToken).toBeTruthy();
		expect(statements.some((item) => item.sql.includes("UPDATE submissions"))).toBe(true);
		expect(statements.some((item) => item.sql.includes("consumed"))).toBe(false);
	});

	it("rejects edits once the submission leaves pre-decision", async () => {
		const db = {
			prepare: (sql: string) => ({
				bind: () => ({
					first: async () => {
						if (sql.includes("FROM submissions")) return { status: "under_review" };
						if (sql.includes("JOIN submission_draft_tokens") || sql.includes("FROM submission_drafts")) {
							return {
								id: "draft-1", event_id: "event-1", form_id: "form-1", verified_email: "speaker@example.com",
								status: "submitted", submission_id: "draft-1",
							};
						}
						if (sql.includes("FROM events") || sql.includes("SELECT * FROM events")) {
							return { id: "event-1", slug: "event", name: "Event", timezone: "UTC", mode: "live", created_at: 0, updated_at: 0 };
						}
						return null;
					},
				}),
			}),
			batch: async () => [],
		} as unknown as D1Database;
		await expect(finalizeDraft(db, {
			secret: "secret", draftId: "draft-1", token: "resume", submitterName: "Speaker", answers: {}, speakers: [],
		})).rejects.toBeInstanceOf(SubmissionNotEditableError);
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
