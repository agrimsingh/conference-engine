import { describe, expect, it } from "vitest";
import {
	deriveWorkflowStatus,
	filterRosterSpeakers,
	isSpeakerWorkflowStatus,
	matchesRosterSearch,
	parseSpeakerSocials,
	resolveRosterBulkEmailTemplateKey,
	rosterContainsEveryRecipient,
	serializeSpeakerSocials,
	type RosterSpeaker,
} from "./roster";

function speaker(partial: Partial<RosterSpeaker> & Pick<RosterSpeaker, "personId" | "email" | "name" | "workflowStatus">): RosterSpeaker {
	return {
		jobTitle: null,
		company: null,
		bio: null,
		logisticsText: null,
		headshot: null,
		socials: {},
		submissionStatuses: [],
		submissionIds: [],
		pendingTaskCount: 0,
		tasks: [],
		earliestDueAt: null,
		profileId: null,
		crm: { owner: null, tags: [], lastContactAt: null },
		...partial,
	};
}

describe("speaker roster domain", () => {
	it("accepts only durable workflow statuses", () => {
		expect(isSpeakerWorkflowStatus("invited")).toBe(true);
		expect(isSpeakerWorkflowStatus("confirmed")).toBe(true);
		expect(isSpeakerWorkflowStatus("pending")).toBe(false);
		expect(isSpeakerWorkflowStatus("removed")).toBe(false);
	});

	it("derives organizer workflow from co-speaker confirmation state", () => {
		expect(deriveWorkflowStatus("confirmed")).toBe("confirmed");
		expect(deriveWorkflowStatus("pending")).toBe("invited");
		expect(deriveWorkflowStatus("declined")).toBe("declined");
		expect(deriveWorkflowStatus("removed")).toBe("withdrawn");
	});

	it("round-trips social_json and drops unknown keys", () => {
		const encoded = serializeSpeakerSocials({
			twitter: " https://x.com/a ",
			linkedin: "",
			website: "https://example.test",
		});
		expect(encoded).toBe(JSON.stringify({ twitter: "https://x.com/a", website: "https://example.test" }));
		expect(parseSpeakerSocials(encoded)).toEqual({
			twitter: "https://x.com/a",
			website: "https://example.test",
		});
		expect(parseSpeakerSocials('{"twitter":"a","bogus":"nope"}')).toEqual({ twitter: "a" });
		expect(parseSpeakerSocials("not-json")).toEqual({});
	});

	it("filters by workflow status and search", () => {
		const rows = [
			speaker({
				personId: "1",
				email: "ada@example.test",
				name: "Ada Lovelace",
				jobTitle: "Mathematician",
				company: "Analytical Engines",
				workflowStatus: "confirmed",
			}),
			speaker({
				personId: "2",
				email: "grace@example.test",
				name: "Grace Hopper",
				workflowStatus: "invited",
				socials: { github: "ghopper" },
			}),
			speaker({
				personId: "3",
				email: "out@example.test",
				name: "Declined Speaker",
				workflowStatus: "declined",
			}),
		];

		expect(filterRosterSpeakers(rows, { status: "confirmed" }).map((row) => row.personId)).toEqual(["1"]);
		expect(filterRosterSpeakers(rows, { status: "invited" }).map((row) => row.personId)).toEqual(["2"]);
		expect(filterRosterSpeakers(rows, { status: "all", q: "engines" }).map((row) => row.personId)).toEqual(["1"]);
		expect(filterRosterSpeakers(rows, { q: "ghopper" }).map((row) => row.personId)).toEqual(["2"]);
		expect(matchesRosterSearch(rows[0]!, "ADA")).toBe(true);
		expect(matchesRosterSearch(rows[0]!, "zzz")).toBe(false);
	});

	it("resolves only safe roster bulk-email template keys", () => {
		expect(resolveRosterBulkEmailTemplateKey(undefined)).toBe("task_reminder");
		expect(resolveRosterBulkEmailTemplateKey("task_reminder")).toBe("task_reminder");
		expect(resolveRosterBulkEmailTemplateKey("speaker_announcement")).toBe("speaker_announcement");
		expect(resolveRosterBulkEmailTemplateKey("acceptance")).toBeNull();
		expect(resolveRosterBulkEmailTemplateKey("organizer_magic_link")).toBeNull();
		expect(resolveRosterBulkEmailTemplateKey(12)).toBeNull();
	});

	it("requires every explicit email recipient to be in the visible event roster", () => {
		const rows = [speaker({ personId: "priya", email: "priya@example.test", name: "Priya", workflowStatus: "confirmed" })];
		expect(rosterContainsEveryRecipient(rows, ["priya"])).toBe(true);
		expect(rosterContainsEveryRecipient(rows, ["priya", "foreign"])).toBe(false);
	});
});
