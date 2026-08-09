import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { createEventWithDefaults } from "@/lib/events/create-event";
import { cloneSession, commitSessionImport, createSession, loadPublicSession, previewSessionImport } from "@/lib/sessions/session";
import type { AccountRow } from "@/lib/db/types";
import { materializeAcceptedSpeaker } from "@/lib/speakers/materialize";

const now = 1_781_000_000_000;
let sequence = 0;

async function event(label: string) {
	sequence += 1;
	const owner: AccountRow = { id: `sessions-owner-${sequence}`, email: `sessions-owner-${sequence}@test.invalid`, name: "Owner", created_at: now, updated_at: now };
	await env.DB.prepare("INSERT INTO accounts (id, email, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)").bind(owner.id, owner.email, owner.name, now, now).run();
	return createEventWithDefaults(env.DB, { name: label, slug: `sessions-${sequence}`, timezone: "UTC", startDay: "2026-11-01", endDay: "2026-11-02" }, owner);
}

function bulk(room: DurableObjectStub, eventId: string, action: "publish" | "unpublish", sessionIds: string[]) {
	return room.fetch("https://event-room/bulk-publication", { method: "POST", headers: { "content-type": "application/json", "x-ce-event-id": eventId }, body: JSON.stringify({ action, sessionIds }) });
}

describe("organizer session creation, lineage, and publication", () => {
	it("creates manual and invited sessions with durable origins and portal-ready speaker identities", async () => {
		const created = await event("Origins");
		const manual = await createSession(env.DB, { eventId: created.eventId, origin: "manual", input: { title: "Manual session", videoUrl: "https://videos.example.test/manual" } });
		const invited = await createSession(env.DB, { eventId: created.eventId, origin: "invited", input: { title: "Invited session", speakers: [{ name: "Ada Invite", email: "ada-invite@test.invalid", bio: "Builds systems." }] } });
		expect(await env.DB.prepare("SELECT origin, video_url, status FROM submissions WHERE id = ?").bind(manual.id).first()).toEqual({ origin: "manual", video_url: "https://videos.example.test/manual", status: "accepted" });
		expect(await env.DB.prepare("SELECT origin, submitter_person_id FROM submissions WHERE id = ?").bind(invited.id).first<{ origin: string; submitter_person_id: string | null }>()).toMatchObject({ origin: "invited", submitter_person_id: expect.any(String) });
		expect(await env.DB.prepare("SELECT COUNT(*) AS count FROM speaker_tasks WHERE submission_id = ?").bind(invited.id).first()).toEqual({ count: 4 });
		expect(await env.DB.prepare("SELECT COUNT(*) AS count FROM event_members WHERE event_id = ? AND role = 'speaker'").bind(created.eventId).first()).toEqual({ count: 1 });
		await expect(createSession(env.DB, { eventId: created.eventId, origin: "invited", input: { title: "Incomplete invite", speakers: [] } })).rejects.toThrow(/require at least one complete speaker/i);
	});

	it("previews formula and duplicate rows, then commits each import only once", async () => {
		const created = await event("Import");
		const csv = "title,speaker_name,speaker_email,video_url\nImport session,Imani,imani-import@test.invalid,https://video.example.test/i\nImport session,Imani,imani-import@test.invalid,https://video.example.test/i\n=Bad,Formula,formula@test.invalid,https://video.example.test/f";
		const preview = await previewSessionImport(env.DB, created.eventId, csv);
		expect(preview).toMatchObject({ ok: true });
		if (!preview.ok) return;
		expect(preview.rows.map((row) => row.duplicate)).toEqual(["none", "csv", "none"]);
		expect(preview.rows[2]?.issues[0]).toMatch(/formula/i);
		const valid = "title,speaker_name,speaker_email\nIdempotent import,Imani,imani-import@test.invalid";
		expect(await commitSessionImport(env.DB, created.eventId, valid)).toMatchObject({ ok: true, created: 1, idempotent: 0 });
		expect(await commitSessionImport(env.DB, created.eventId, valid)).toMatchObject({ ok: true, created: 0, idempotent: 1 });
		expect(await env.DB.prepare("SELECT origin, COUNT(*) AS count FROM submissions WHERE event_id = ? GROUP BY origin").bind(created.eventId).all()).toMatchObject({ results: [{ origin: "imported", count: 1 }] });
	});

	it("reports per-row partial CSV commits instead of claiming an all-or-nothing import", async () => {
		const created = await event("Partial import");
		await env.DB.prepare(`CREATE TRIGGER fail_partial_import_task
      BEFORE INSERT ON speaker_tasks
      WHEN (SELECT submitter_email FROM submissions WHERE id = NEW.submission_id) = 'bad-partial@test.invalid'
      BEGIN SELECT RAISE(ABORT, 'injected partial CSV failure'); END`).run();
		const csv = "title,speaker_name,speaker_email\nFirst committed,First,first-partial@test.invalid\nFails safely,Bad,bad-partial@test.invalid\nThird committed,Third,third-partial@test.invalid";
		const partial = await commitSessionImport(env.DB, created.eventId, csv);
		expect(partial).toMatchObject({ ok: true, created: 2, failed: 1, partial: true });
		if (!partial.ok) return;
		expect(partial.failures).toEqual([{ row: 3, error: expect.stringMatching(/injected partial CSV failure/i), status: 400 }]);
		expect(partial.rows.find((row) => row.row === 3)?.issues).toContainEqual(expect.stringMatching(/Commit failed/i));
		expect(await env.DB.prepare("SELECT COUNT(*) AS count FROM speaker_tasks WHERE event_id = ?").bind(created.eventId).first()).toEqual({ count: 8 });
		await env.DB.prepare("DROP TRIGGER fail_partial_import_task").run();
		const retried = await commitSessionImport(env.DB, created.eventId, csv);
		expect(retried).toMatchObject({ ok: true, created: 0, idempotent: 2, repaired: 1, failed: 0, partial: false });
	});

	it("repairs an interrupted import deterministically and removes failed manual and invited shells", async () => {
		const created = await event("Repair");
		const input = { title: "Repairable import", speakers: [{ name: "Rae", email: "rae-repair@test.invalid" }] };
		const materializeFailure: typeof materializeAcceptedSpeaker = async (db, args, timestamp) => {
			await materializeAcceptedSpeaker(db, args, timestamp);
			throw new Error("injected materialization failure after person, profile, membership, and tasks");
		};
		await expect(createSession(env.DB, { eventId: created.eventId, origin: "imported", input, importKey: "repair-key", materializeSpeaker: materializeFailure })).rejects.toThrow(/injected/i);
		const interrupted = await env.DB.prepare("SELECT id FROM submissions WHERE event_id = ? AND import_key = 'repair-key'").bind(created.eventId).first<{ id: string }>();
		expect(interrupted).not.toBeNull();
		expect(await env.DB.prepare("SELECT COUNT(*) AS count FROM people WHERE email = ?").bind("rae-repair@test.invalid").first()).toEqual({ count: 0 });
		expect(await env.DB.prepare("SELECT COUNT(*) AS count FROM event_members WHERE event_id = ? AND role = 'speaker'").bind(created.eventId).first()).toEqual({ count: 0 });
		expect(await env.DB.prepare("SELECT COUNT(*) AS count FROM speaker_profiles WHERE event_id = ?").bind(created.eventId).first()).toEqual({ count: 0 });
		expect(await env.DB.prepare("SELECT COUNT(*) AS count FROM speaker_tasks WHERE submission_id = ?").bind(interrupted?.id).first()).toEqual({ count: 0 });
		const repaired = await createSession(env.DB, { eventId: created.eventId, origin: "imported", input, importKey: "repair-key" });
		expect(repaired.id).toBe(interrupted?.id);
		expect(await env.DB.prepare("SELECT COUNT(*) AS count FROM speaker_tasks WHERE submission_id = ?").bind(repaired.id).first()).toEqual({ count: 4 });
		expect(await env.DB.prepare("SELECT COUNT(*) AS count FROM people WHERE email = ?").bind("rae-repair@test.invalid").first()).toEqual({ count: 1 });
		expect(await env.DB.prepare("SELECT COUNT(*) AS count FROM event_members WHERE event_id = ? AND role = 'speaker'").bind(created.eventId).first()).toEqual({ count: 1 });
		expect(await env.DB.prepare("SELECT COUNT(*) AS count FROM speaker_profiles WHERE event_id = ?").bind(created.eventId).first()).toEqual({ count: 1 });
		await expect(createSession(env.DB, { eventId: created.eventId, origin: "manual", input: { title: "Shared identity stays", speakers: [{ name: "Rae", email: "rae-repair@test.invalid" }] }, materializeSpeaker: materializeFailure })).rejects.toThrow(/injected/i);
		expect(await env.DB.prepare("SELECT COUNT(*) AS count FROM people WHERE email = ?").bind("rae-repair@test.invalid").first()).toEqual({ count: 1 });
		expect(await env.DB.prepare("SELECT COUNT(*) AS count FROM event_members WHERE event_id = ? AND role = 'speaker'").bind(created.eventId).first()).toEqual({ count: 1 });
		expect(await env.DB.prepare("SELECT COUNT(*) AS count FROM speaker_profiles WHERE event_id = ?").bind(created.eventId).first()).toEqual({ count: 1 });
		expect(await env.DB.prepare("SELECT COUNT(*) AS count FROM submissions WHERE event_id = ? AND json_extract(answers_json, '$.title') = 'Shared identity stays'").bind(created.eventId).first()).toEqual({ count: 0 });
		await expect(createSession(env.DB, { eventId: created.eventId, origin: "invited", input: { title: "No partial invite", speakers: [{ name: "Mia", email: "mia-repair@test.invalid" }] }, materializeSpeaker: materializeFailure })).rejects.toThrow(/injected/i);
		expect(await env.DB.prepare("SELECT COUNT(*) AS count FROM submissions WHERE event_id = ? AND json_extract(answers_json, '$.title') = 'No partial invite'").bind(created.eventId).first()).toEqual({ count: 0 });
		expect(await env.DB.prepare("SELECT COUNT(*) AS count FROM people WHERE email = ?").bind("mia-repair@test.invalid").first()).toEqual({ count: 0 });
		expect(await env.DB.prepare("SELECT COUNT(*) AS count FROM event_members WHERE event_id = ? AND role = 'speaker'").bind(created.eventId).first()).toEqual({ count: 1 });
		expect(await env.DB.prepare("SELECT COUNT(*) AS count FROM speaker_profiles WHERE event_id = ?").bind(created.eventId).first()).toEqual({ count: 1 });
		expect(await env.DB.prepare("SELECT COUNT(*) AS count FROM speaker_tasks WHERE event_id = ?").bind(created.eventId).first()).toEqual({ count: 4 });
	});

	it("restores an existing blank name and keeps a newly materialized person when concurrent references exist", async () => {
		const created = await event("Identity rollback safety");
		await env.DB.prepare("INSERT INTO people (id, email, name, created_at) VALUES ('blank-session-person', 'blank-session@test.invalid', NULL, ?)").bind(now).run();
		const failAfterMaterialization: typeof materializeAcceptedSpeaker = async (db, args, timestamp) => {
			await materializeAcceptedSpeaker(db, args, timestamp);
			throw new Error("injected identity rollback failure");
		};
		await expect(createSession(env.DB, { eventId: created.eventId, origin: "manual", input: { title: "Restore blank name", speakers: [{ name: "Blank Name", email: "blank-session@test.invalid" }] }, materializeSpeaker: failAfterMaterialization })).rejects.toThrow(/identity rollback/i);
		expect(await env.DB.prepare("SELECT name FROM people WHERE id = 'blank-session-person'").first()).toEqual({ name: null });

		const failWithDependents: typeof materializeAcceptedSpeaker = async (db, args, timestamp) => {
			const materialized = await materializeAcceptedSpeaker(db, args, timestamp);
			await db.batch([
				db.prepare("INSERT INTO auth_challenges (token_hash, kind, person_id, event_id, state, expires_at, created_at) VALUES ('session-dependent-challenge', 'portal_login', ?, ?, 'active', ?, ?)").bind(materialized.personId, args.eventId, now + 60_000, now),
				db.prepare("INSERT INTO assets (id, event_id, r2_key, content_type, filename, uploaded_by_person_id, created_at) VALUES ('session-dependent-asset', ?, 'events/session-dependent-asset', 'image/png', 'dependent.png', ?, ?)").bind(args.eventId, materialized.personId, now),
			]);
			throw new Error("injected dependent rollback failure");
		};
		await expect(createSession(env.DB, { eventId: created.eventId, origin: "manual", input: { title: "Keep dependent person", speakers: [{ name: "Dependent", email: "dependent-session@test.invalid" }] }, materializeSpeaker: failWithDependents })).rejects.toThrow(/dependent rollback/i);
		expect(await env.DB.prepare("SELECT COUNT(*) AS count FROM people WHERE email = 'dependent-session@test.invalid'").first()).toEqual({ count: 1 });
		expect(await env.DB.prepare("SELECT COUNT(*) AS count FROM auth_challenges WHERE token_hash = 'session-dependent-challenge'").first()).toEqual({ count: 1 });
		expect(await env.DB.prepare("SELECT COUNT(*) AS count FROM assets WHERE id = 'session-dependent-asset'").first()).toEqual({ count: 1 });
		expect(await env.DB.prepare("SELECT COUNT(*) AS count FROM speaker_profiles WHERE event_id = ?").bind(created.eventId).first()).toEqual({ count: 0 });
		expect(await env.DB.prepare("SELECT COUNT(*) AS count FROM event_members WHERE event_id = ? AND role = 'speaker'").bind(created.eventId).first()).toEqual({ count: 0 });
		expect(await env.DB.prepare("SELECT COUNT(*) AS count FROM speaker_tasks WHERE event_id = ?").bind(created.eventId).first()).toEqual({ count: 0 });
	});

	it("does not let a failed import retry remove tasks created by a concurrent successful retry", async () => {
		const created = await event("Concurrent import repair");
		const input = { title: "Concurrent repair", speakers: [{ name: "Connie", email: "connie-repair@test.invalid" }] };
		let enteredFailure: () => void = () => undefined;
		let releaseFailure: () => void = () => undefined;
		const failureEntered = new Promise<void>((resolve) => { enteredFailure = resolve; });
		const release = new Promise<void>((resolve) => { releaseFailure = resolve; });
		const delayedFailure: typeof materializeAcceptedSpeaker = async () => {
			enteredFailure();
			await release;
			throw new Error("injected concurrent materialization failure");
		};
		const failing = createSession(env.DB, { eventId: created.eventId, origin: "imported", input, importKey: "concurrent-repair-key", materializeSpeaker: delayedFailure });
		const failureResult = failing.then(
			() => null,
			(error: unknown) => error,
		);
		await failureEntered;
		let successfulSettled = false;
		const successfulRetry = createSession(env.DB, { eventId: created.eventId, origin: "imported", input, importKey: "concurrent-repair-key" }).then((value) => {
			successfulSettled = true;
			return value;
		});
		await new Promise<void>((resolve) => setTimeout(resolve, 50));
		expect(successfulSettled).toBe(false);
		releaseFailure();
		const successful = await successfulRetry;
		const failure = await failureResult;
		expect(failure).toBeInstanceOf(Error);
		expect((failure as Error).message).toMatch(/concurrent/i);
		expect(await env.DB.prepare("SELECT COUNT(*) AS count FROM speaker_tasks WHERE submission_id = ?").bind(successful.id).first()).toEqual({ count: 4 });
		expect(await env.DB.prepare("SELECT submitter_person_id FROM submissions WHERE id = ?").bind(successful.id).first<{ submitter_person_id: string | null }>()).toEqual({ submitter_person_id: expect.any(String) });
		expect(await env.DB.prepare("SELECT person_id FROM submission_speakers WHERE submission_id = ?").bind(successful.id).all<{ person_id: string | null }>()).toMatchObject({ results: [{ person_id: expect.any(String) }] });
		expect(await env.DB.prepare("SELECT COUNT(*) AS count FROM session_materialization_claims WHERE submission_id = ?").bind(successful.id).first()).toEqual({ count: 0 });
	});

	it("reclaims a bounded stale materialization claim", async () => {
		const created = await event("Expired materialization claim");
		const input = { title: "Lease recovery", speakers: [{ name: "Leah", email: "leah-lease@test.invalid" }] };
		const initial = await createSession(env.DB, { eventId: created.eventId, origin: "imported", input, importKey: "expired-claim-key" });
		await env.DB.prepare("INSERT INTO session_materialization_claims (submission_id, owner_token, lease_expires_at, created_at, updated_at) VALUES (?, 'stale-owner', ?, ?, ?)").bind(initial.id, Date.now() - 1, now, now).run();
		const retried = await createSession(env.DB, { eventId: created.eventId, origin: "imported", input, importKey: "expired-claim-key" });
		expect(retried.id).toBe(initial.id);
		expect(await env.DB.prepare("SELECT COUNT(*) AS count FROM session_materialization_claims WHERE submission_id = ?").bind(initial.id).first()).toEqual({ count: 0 });
	});

	it("fences an expired owner so its rollback cannot mutate a reclaimed session", async () => {
		const created = await event("Lease fencing");
		const input = { title: "Fenced recovery", speakers: [{ name: "Faye", email: "faye-fence@test.invalid" }] };
		let enteredFailure: () => void = () => undefined;
		let releaseFailure: () => void = () => undefined;
		const failureEntered = new Promise<void>((resolve) => { enteredFailure = resolve; });
		const release = new Promise<void>((resolve) => { releaseFailure = resolve; });
		const delayedFailure: typeof materializeAcceptedSpeaker = async (db, args, timestamp) => {
			enteredFailure();
			await release;
			// This is an old worker resuming after another owner reclaimed its
			// lease. It tries to run every normal materialization phase.
			await materializeAcceptedSpeaker(db, args, timestamp);
			throw new Error("injected fenced owner failure");
		};
		const oldOwner = createSession(env.DB, {
			eventId: created.eventId,
			origin: "imported",
			input,
			importKey: "fenced-repair-key",
			materializeSpeaker: delayedFailure,
			materializationClaim: { now: () => 0, leaseMs: 10 },
		});
		const oldOwnerResult = oldOwner.then(() => null, (error: unknown) => error);
		await failureEntered;
		const recovered = await createSession(env.DB, {
			eventId: created.eventId,
			origin: "imported",
			input,
			importKey: "fenced-repair-key",
			materializationClaim: { now: () => 20, leaseMs: 10, maxAttempts: 1 },
		});
		releaseFailure();
		const oldFailure = await oldOwnerResult;
		expect(oldFailure).toBeInstanceOf(Error);
		expect((oldFailure as Error).message).toMatch(/claim was lost/i);
		expect(await env.DB.prepare("SELECT submitter_person_id FROM submissions WHERE id = ?").bind(recovered.id).first<{ submitter_person_id: string | null }>()).toEqual({ submitter_person_id: expect.any(String) });
		expect(await env.DB.prepare("SELECT person_id FROM submission_speakers WHERE submission_id = ?").bind(recovered.id).all<{ person_id: string | null }>()).toMatchObject({ results: [{ person_id: expect.any(String) }] });
		expect(await env.DB.prepare("SELECT COUNT(*) AS count FROM people WHERE email = ?").bind("faye-fence@test.invalid").first()).toEqual({ count: 1 });
		expect(await env.DB.prepare("SELECT COUNT(*) AS count FROM event_members WHERE event_id = ? AND role = 'speaker'").bind(created.eventId).first()).toEqual({ count: 1 });
		expect(await env.DB.prepare("SELECT COUNT(*) AS count FROM speaker_profiles WHERE event_id = ?").bind(created.eventId).first()).toEqual({ count: 1 });
		expect(await env.DB.prepare("SELECT COUNT(*) AS count FROM speaker_tasks WHERE submission_id = ?").bind(recovered.id).first()).toEqual({ count: 4 });
	});

	it("binds the phase write itself to the owner token after a post-renew reclaim", async () => {
		const created = await event("Phase write fence");
		await env.DB.prepare("INSERT INTO people (id, email, name, created_at) VALUES ('phase-fence-person', 'phase-fence@test.invalid', NULL, ?)").bind(now).run();
		let enteredPhase: () => void = () => undefined;
		let releasePhase: () => void = () => undefined;
		const phaseEntered = new Promise<void>((resolve) => { enteredPhase = resolve; });
		const release = new Promise<void>((resolve) => { releasePhase = resolve; });
		const staleOwner = createSession(env.DB, {
			eventId: created.eventId,
			origin: "imported",
			input: { title: "Stale phase", speakers: [{ name: "Stale name", email: "phase-fence@test.invalid" }] },
			importKey: "phase-fence-key",
			materializationClaim: { now: () => 0, leaseMs: 10 },
			materializationPhaseHook: async (phase) => {
				if (phase !== "person-name") return;
				enteredPhase();
				await release;
			},
		});
		const staleResult = staleOwner.then(() => null, (error: unknown) => error);
		await phaseEntered;
		const winner = await createSession(env.DB, {
			eventId: created.eventId,
			origin: "imported",
			input: { title: "Winning phase", speakers: [{ name: "Winning name", email: "phase-fence@test.invalid" }] },
			importKey: "phase-fence-key",
			materializationClaim: { now: () => 20, leaseMs: 10, maxAttempts: 1 },
		});
		// Put the target back into the exact pre-write state. Without the owner
		// predicate, the stale update would now write "Stale name".
		await env.DB.prepare("UPDATE people SET name = NULL WHERE id = 'phase-fence-person'").run();
		releasePhase();
		const staleFailure = await staleResult;
		expect(staleFailure).toBeInstanceOf(Error);
		expect((staleFailure as Error).message).toMatch(/claim was lost/i);
		expect(await env.DB.prepare("SELECT name FROM people WHERE id = 'phase-fence-person'").first()).toEqual({ name: null });
		expect(await env.DB.prepare("SELECT submitter_person_id FROM submissions WHERE id = ?").bind(winner.id).first<{ submitter_person_id: string | null }>()).toEqual({ submitter_person_id: "phase-fence-person" });
		expect(await env.DB.prepare("SELECT COUNT(*) AS count FROM speaker_tasks WHERE submission_id = ?").bind(winner.id).first()).toEqual({ count: 4 });
	});

	it("clones session content with explicit parent/root lineage and preserves target tenant state", async () => {
		const sourceEvent = await event("Source");
		const targetEvent = await event("Target");
		const source = await createSession(env.DB, { eventId: sourceEvent.eventId, origin: "manual", input: { title: "Clone this", abstract: "Carry content", speakers: [{ name: "Clara", email: "clara-clone@test.invalid" }], googleDocUrl: "https://docs.google.com/document/d/clone" } });
		const clone = await cloneSession(env.DB, { targetEventId: targetEvent.eventId, sourceSubmissionId: source.id });
		expect(await env.DB.prepare("SELECT event_id, origin, lineage_parent_submission_id, lineage_root_submission_id, lineage_source_event_id, google_doc_url FROM submissions WHERE id = ?").bind(clone.id).first()).toEqual({ event_id: targetEvent.eventId, origin: "cloned", lineage_parent_submission_id: source.id, lineage_root_submission_id: source.id, lineage_source_event_id: sourceEvent.eventId, google_doc_url: "https://docs.google.com/document/d/clone" });
		expect(await env.DB.prepare("SELECT COUNT(*) AS count FROM submission_speakers WHERE submission_id = ?").bind(clone.id).first()).toEqual({ count: 1 });
	});

	it("rejects non-session clone sources and malformed source titles", async () => {
		const sourceEvent = await event("Rejected source");
		const targetEvent = await event("Clone target");
		const source = await createSession(env.DB, { eventId: sourceEvent.eventId, origin: "manual", input: { title: "Never clone this" } });
		await env.DB.prepare("UPDATE submissions SET status = 'rejected' WHERE id = ?").bind(source.id).run();
		await expect(cloneSession(env.DB, { targetEventId: targetEvent.eventId, sourceSubmissionId: source.id })).rejects.toThrow(/accepted, scheduled, or published/i);
		await env.DB.prepare("UPDATE submissions SET status = 'accepted', answers_json = '{}' WHERE id = ?").bind(source.id).run();
		await expect(cloneSession(env.DB, { targetEventId: targetEvent.eventId, sourceSubmissionId: source.id })).rejects.toThrow(/valid title/i);
	});

	it("denies cross-event bulk selection, only publishes placed sessions, and exposes media after publication", async () => {
		const created = await event("Public");
		const other = await event("Other");
		const session = await createSession(env.DB, { eventId: created.eventId, origin: "manual", input: { title: "Public session", supportingUrl: "https://resources.example.test/public" } });
		const foreign = await createSession(env.DB, { eventId: other.eventId, origin: "manual", input: { title: "Foreign" } });
		const room = env.EVENT_ROOM.getByName(created.eventId);
		expect((await bulk(room, created.eventId, "publish", [foreign.id])).status).toBe(404);
		expect((await bulk(room, created.eventId, "publish", [session.id])).status).toBe(409);
		await env.DB.batch([
			env.DB.prepare("UPDATE submissions SET status = 'scheduled' WHERE id = ?").bind(session.id),
			env.DB.prepare("INSERT INTO agenda_slots (id, event_id, submission_id, room_name, starts_at, ends_at, ics_uid, created_at, updated_at) VALUES ('sessions-public-slot', ?, ?, 'Main', ?, ?, 'sessions-public-slot@test.invalid', ?, ?)").bind(created.eventId, session.id, Date.parse("2026-11-01T10:00:00Z"), Date.parse("2026-11-01T10:30:00Z"), now, now),
		]);
		expect(await loadPublicSession(env.DB, created.slug, session.id)).toBeNull();
		expect((await bulk(room, created.eventId, "publish", [session.id])).status).toBe(200);
		expect(await loadPublicSession(env.DB, created.slug, session.id)).toMatchObject({ submission: { id: session.id, supporting_url: "https://resources.example.test/public" }, slot: { roomName: "Main", trackId: null, trackName: "Unassigned" } });
		const track = await env.DB.prepare("SELECT id, name FROM agenda_tracks WHERE event_id = ? AND soft_deleted = 0").bind(created.eventId).first<{ id: string; name: string }>();
		expect(track).not.toBeNull();
		await env.DB.prepare("UPDATE agenda_slots SET track_id = ? WHERE submission_id = ?").bind(track!.id, session.id).run();
		expect(await loadPublicSession(env.DB, created.slug, session.id)).toMatchObject({ slot: { trackId: track!.id, trackName: track!.name } });
	});

	it("serializes bulk publication with unplace so no published session loses its slot", async () => {
		const created = await event("Publication race");
		const session = await createSession(env.DB, { eventId: created.eventId, origin: "manual", input: { title: "Race session" } });
		await env.DB.batch([
			env.DB.prepare("UPDATE submissions SET status = 'scheduled' WHERE id = ?").bind(session.id),
			env.DB.prepare("INSERT INTO agenda_slots (id, event_id, submission_id, room_name, starts_at, ends_at, ics_uid, created_at, updated_at) VALUES ('sessions-race-slot', ?, ?, 'Main', ?, ?, 'sessions-race-slot@test.invalid', ?, ?)").bind(created.eventId, session.id, Date.parse("2026-11-01T11:00:00Z"), Date.parse("2026-11-01T11:30:00Z"), now, now),
		]);
		const room = env.EVENT_ROOM.getByName(created.eventId);
		const [publish, unplace] = await Promise.all([
			bulk(room, created.eventId, "publish", [session.id]),
			room.fetch("https://event-room/schedule", { method: "DELETE", headers: { "content-type": "application/json", "x-ce-event-id": created.eventId }, body: JSON.stringify({ submissionId: session.id }) }),
		]);
		expect([
			[200, 200], // publish first, then unplace
			[409, 200], // unplace first, then publish rejects the unplaced session
		]).toContainEqual([publish.status, unplace.status]);
		const state = await env.DB.prepare("SELECT s.status, (SELECT COUNT(*) FROM agenda_slots a WHERE a.submission_id = s.id) AS slots FROM submissions s WHERE s.id = ?").bind(session.id).first<{ status: string; slots: number }>();
		expect([{ status: "accepted", slots: 0 }, { status: "published", slots: 1 }]).toContainEqual(state);
	});
});
