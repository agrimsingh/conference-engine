import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import {
	createAccountContact,
	enrollContactInPipeline,
	importAccountContactsCsv,
	listAccountContacts,
	mergeAccountContacts,
	moveContactPipelineStage,
	pushContactToEvent,
} from "@/lib/contacts";

const now = 1_790_600_000_000;

const FIXTURE_CSV = `name,email,title,company,bio
Priya Raman,priya.speaker@sbek-test.example.com,Principal Engineer,Latticework Systems,"Leads the build-tooling platform team at Latticework Systems."
Marcus Okafor,marcus.speaker@sbek-test.example.com,Staff Developer Advocate,Cloudreach Labs,"Focused on AI agents in production; writes Agents Weekly."
Dana Kowalski,dana.speaker@sbek-test.example.com,Engineering Manager,Substrate,"Runs the developer-experience org at Substrate; ex-CI lead at a fintech."
`;

async function seedAccount(suffix: string) {
	const accountId = `acc-${suffix}`;
	const eventId = `evt-${suffix}`;
	// event_ownership has a composite FK to event_memberships, so membership first.
	await env.DB.batch([
		env.DB.prepare(
			`INSERT INTO accounts (id, email, name, created_at, updated_at)
			 VALUES (?, ?, 'Organizer', ?, ?)`,
		).bind(accountId, `${suffix}@example.test`, now, now),
		env.DB.prepare(
			`INSERT INTO events (id, slug, name, timezone, created_at, updated_at)
			 VALUES (?, ?, 'DevFlow Conf 2027', 'UTC', ?, ?)`,
		).bind(eventId, `devflow-${suffix}`, now, now),
		env.DB.prepare(
			`INSERT INTO event_memberships (id, event_id, account_id, role, created_at)
			 VALUES (?, ?, ?, 'admin', ?)`,
		).bind(`mem-${suffix}`, eventId, accountId, now),
		env.DB.prepare(
			`INSERT INTO event_ownership (event_id, account_id, created_at, updated_at)
			 VALUES (?, ?, ?, ?)`,
		).bind(eventId, accountId, now, now),
	]);
	return { accountId, eventId };
}

describe("account contacts CRM", () => {
	it("scopes contacts to an account and dedupes CSV reimport by email", async () => {
		const { accountId } = await seedAccount("scope");
		const other = await seedAccount("other");

		const first = await importAccountContactsCsv(env.DB, {
			accountId,
			csv: FIXTURE_CSV,
			now,
		});
		expect(first.ok).toBe(true);
		if (!first.ok) return;
		expect(first.imported).toBe(3);
		expect(first.updated).toBe(0);

		const second = await importAccountContactsCsv(env.DB, {
			accountId,
			csv: FIXTURE_CSV,
			now: now + 1,
		});
		expect(second.ok).toBe(true);
		if (!second.ok) return;
		expect(second.imported).toBe(0);
		expect(second.updated).toBe(3);

		const mine = await listAccountContacts(env.DB, accountId);
		const theirs = await listAccountContacts(env.DB, other.accountId);
		expect(mine).toHaveLength(3);
		expect(theirs).toHaveLength(0);
		expect(mine.map((row) => row.name).sort()).toEqual([
			"Dana Kowalski",
			"Marcus Okafor",
			"Priya Raman",
		]);
	});

	it("merges same-name different-email duplicates into the primary record", async () => {
		const { accountId } = await seedAccount("merge");
		const primary = await createAccountContact(env.DB, {
			accountId,
			now,
			input: {
				name: "Priya Raman",
				email: "priya.speaker@sbek-test.example.com",
				company: "Latticework Systems",
				tags: ["AI"],
			},
		});
		const secondary = await createAccountContact(env.DB, {
			accountId,
			now: now + 1,
			input: {
				name: "Priya Raman",
				email: "priya.raman.alt@sbek-test.example.com",
				title: "Principal Engineer",
				bio: "Alt bio",
			},
		});
		expect(primary.ok && secondary.ok).toBe(true);
		if (!primary.ok || !secondary.ok) return;

		const merged = await mergeAccountContacts(env.DB, {
			accountId,
			primaryContactId: primary.value.id,
			secondaryContactId: secondary.value.id,
			now: now + 2,
		});
		expect(merged.ok).toBe(true);
		if (!merged.ok) return;

		const remaining = await listAccountContacts(env.DB, accountId);
		expect(remaining).toHaveLength(1);
		expect(remaining[0]?.email).toBe("priya.speaker@sbek-test.example.com");
		expect(remaining[0]?.title).toBe("Principal Engineer");
		expect(remaining[0]?.tags).toContain("AI");
		expect(merged.value.activities.some((entry) => entry.kind === "merge")).toBe(true);
	});

	it("persists pipeline enroll and stage moves with history", async () => {
		const { accountId } = await seedAccount("pipeline");
		const created = await createAccountContact(env.DB, {
			accountId,
			now,
			input: {
				name: "Marcus Okafor",
				email: "marcus.speaker@sbek-test.example.com",
				company: "Cloudreach Labs",
			},
		});
		expect(created.ok).toBe(true);
		if (!created.ok) return;

		const enrolled = await enrollContactInPipeline(env.DB, {
			accountId,
			contactId: created.value.id,
			stage: "research",
			now: now + 1,
		});
		expect(enrolled.ok).toBe(true);

		const moved = await moveContactPipelineStage(env.DB, {
			accountId,
			contactId: created.value.id,
			toStage: "outreach",
			note: "Left voicemail 2027-01-15; follow up next week.",
			now: now + 2,
		});
		expect(moved.ok).toBe(true);

		const listed = await listAccountContacts(env.DB, accountId);
		expect(listed[0]?.stage).toBe("outreach");

		const history = await env.DB
			.prepare(
				`SELECT from_stage, to_stage, note FROM account_contact_stage_history
				 WHERE contact_id = ? ORDER BY changed_at ASC`,
			)
			.bind(created.value.id)
			.all<{ from_stage: string | null; to_stage: string; note: string | null }>();
		expect(history.results).toHaveLength(2);
		expect(history.results[1]?.to_stage).toBe("outreach");
		expect(history.results[1]?.note).toContain("voicemail");
	});

	it("pushes a contact into an owned event speaker roster without re-entry", async () => {
		const { accountId, eventId } = await seedAccount("push");
		const created = await createAccountContact(env.DB, {
			accountId,
			now,
			input: {
				name: "Dana Kowalski",
				email: "dana.speaker@sbek-test.example.com",
				title: "Engineering Manager",
				company: "Substrate",
				bio: "Runs the developer-experience org at Substrate",
			},
		});
		expect(created.ok).toBe(true);
		if (!created.ok) return;

		const pushed = await pushContactToEvent(env.DB, {
			accountId,
			contactId: created.value.id,
			eventId,
			now: now + 1,
		});
		expect(pushed.ok).toBe(true);
		if (!pushed.ok) return;

		const profile = await env.DB
			.prepare(
				`SELECT sp.display_name, sp.job_title, sp.company, sp.bio, p.email
				 FROM event_speaker_contacts esc
				 JOIN people p ON p.id = esc.person_id
				 JOIN speaker_profiles sp ON sp.event_id = esc.event_id AND sp.person_id = esc.person_id
				 WHERE esc.contact_id = ? AND esc.event_id = ?`,
			)
			.bind(created.value.id, eventId)
			.first<{
				display_name: string;
				job_title: string | null;
				company: string | null;
				bio: string | null;
				email: string;
			}>();

		expect(profile).toMatchObject({
			display_name: "Dana Kowalski",
			job_title: "Engineering Manager",
			company: "Substrate",
			email: "dana.speaker@sbek-test.example.com",
		});
		expect(profile?.bio).toContain("developer-experience");

		const again = await pushContactToEvent(env.DB, {
			accountId,
			contactId: created.value.id,
			eventId,
			now: now + 2,
		});
		expect(again.ok).toBe(true);
		if (!again.ok) return;
		expect(again.value.personId).toBe(pushed.value.personId);
	});
});
