import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { listCloneableSessionsForEvents } from "@/lib/db/queries";

const now = 1_780_700_000_000;

describe("listCloneableSessionsForEvents", () => {
	it("returns only accepted/scheduled/published rows for the authorized event ids", async () => {
		await env.DB.batch([
			env.DB.prepare(
				"INSERT INTO events (id, slug, name, timezone, created_at, updated_at) VALUES (?, ?, ?, 'UTC', ?, ?)",
			).bind("clone-a", "clone-a", "Clone A", now, now),
			env.DB.prepare(
				"INSERT INTO events (id, slug, name, timezone, created_at, updated_at) VALUES (?, ?, ?, 'UTC', ?, ?)",
			).bind("clone-b", "clone-b", "Clone B", now, now),
			env.DB.prepare(
				"INSERT INTO cfp_forms (id, event_id, slug, title, status, created_at, updated_at) VALUES (?, ?, 'cfp', 'CFP', 'open', ?, ?)",
			).bind("clone-form-a", "clone-a", now, now),
			env.DB.prepare(
				"INSERT INTO cfp_forms (id, event_id, slug, title, status, created_at, updated_at) VALUES (?, ?, 'cfp', 'CFP', 'open', ?, ?)",
			).bind("clone-form-b", "clone-b", now, now),
			env.DB.prepare(
				"INSERT INTO submissions (id, form_id, event_id, status, answers_json, submitter_name, created_at, updated_at) VALUES (?, ?, ?, ?, '{}', ?, ?, ?)",
			).bind("sub-accepted", "clone-form-a", "clone-a", "accepted", "Accepted talk", now, now),
			env.DB.prepare(
				"INSERT INTO submissions (id, form_id, event_id, status, answers_json, submitter_name, created_at, updated_at) VALUES (?, ?, ?, ?, '{}', ?, ?, ?)",
			).bind("sub-draft", "clone-form-a", "clone-a", "submitted", "Draft talk", now, now),
			env.DB.prepare(
				"INSERT INTO submissions (id, form_id, event_id, status, answers_json, submitter_name, created_at, updated_at) VALUES (?, ?, ?, ?, '{}', ?, ?, ?)",
			).bind("sub-other", "clone-form-b", "clone-b", "published", "Other event", now, now),
		]);

		const rows = await listCloneableSessionsForEvents(env.DB, ["clone-a"]);
		expect(rows.map((row) => row.id)).toEqual(["sub-accepted"]);
		expect(rows[0]).toMatchObject({
			event_id: "clone-a",
			event_slug: "clone-a",
			status: "accepted",
			submitter_name: "Accepted talk",
		});

		expect(await listCloneableSessionsForEvents(env.DB, [])).toEqual([]);
	});
});
