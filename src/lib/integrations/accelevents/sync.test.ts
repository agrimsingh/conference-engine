import { describe, expect, it } from "vitest";
import { buildAcceleventsSyncPlan } from "./sync";

describe("Accelevents sync plan", () => {
	it("plans speakers before accepted and scheduled sessions, skipping unchanged mappings", () => {
		const plan = buildAcceleventsSyncPlan({
			sessionTypeFormat: "IN_PERSON",
			speakers: [
				{
					localId: "person-ada",
					name: "Ada Lovelace",
					email: "ada@example.test",
					bio: "Computing pioneer",
					jobTitle: "Engineer",
					company: "Analytical Engines",
					imageUrl: null,
				},
			],
			sessions: [
				{
					localId: "submission-accepted",
					status: "accepted",
					title: "Accepted talk",
					abstract: "A proposal that is not yet scheduled.",
					startsAt: null,
					endsAt: null,
					speakerLocalIds: ["person-ada"],
				},
				{
					localId: "submission-scheduled",
					status: "scheduled",
					title: "Scheduled talk",
					abstract: "A talk with an agenda slot.",
					startsAt: 1_735_689_600_000,
					endsAt: 1_735_693_200_000,
					speakerLocalIds: ["person-ada"],
				},
			],
			mappings: [
				{
					localKind: "speaker",
					localId: "person-ada",
					externalId: "101",
					syncState: "synced",
					sourceFingerprint:
						'{"firstName":"Ada","lastName":"Lovelace","email":"ada@example.test","bio":"Computing pioneer","company":"Analytical Engines","title":"Engineer"}',
				},
			],
			timezone: "UTC",
		});

		expect(plan.actions.map((action) => [action.kind, action.localId, action.operation])).toEqual([
			["speaker", "person-ada", "skip"],
			["session", "submission-accepted", "create"],
			["session", "submission-scheduled", "create"],
		]);
		const accepted = plan.actions[1];
		const scheduled = plan.actions[2];
		if (!accepted || !scheduled) throw new Error("Expected two session actions");
		expect(accepted.payload).toMatchObject({
			title: "Accepted talk",
			hideSessionFromAttendees: true,
			sessionTypeFormat: "IN_PERSON",
		});
		expect(accepted.payload).not.toHaveProperty("startTime");
		expect(scheduled.payload).toMatchObject({
			startTime: "2025/01/01 00:00",
			endTime: "2025/01/01 01:00",
			hideSessionFromAttendees: true,
		});
	});

	it("includes a stable public headshot URL in the speaker payload", () => {
		const plan = buildAcceleventsSyncPlan({
			sessionTypeFormat: "IN_PERSON",
			speakers: [{
				localId: "person-grace",
				name: "Grace Hopper",
				email: "grace@example.test",
				bio: "Compiler pioneer",
				jobTitle: "Rear Admiral",
				company: "US Navy",
				imageUrl: "https://conference.example/api/e/dev-summit/people/person-grace/headshot",
			}],
			sessions: [],
			mappings: [],
			timezone: "UTC",
		});

		expect(plan.actions[0]?.payload).toMatchObject({
			imageUrl: "https://conference.example/api/e/dev-summit/people/person-grace/headshot",
		});
	});
});
