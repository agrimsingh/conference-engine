import { describe, expect, it } from "vitest";
import {
	buildAgendaReadiness,
	countConflictedSessions,
	isContentApproved,
	isProgrammeSession,
	isScheduledOnAgenda,
	type AgendaReadinessSession,
} from "./agenda-readiness";

function session(
	overrides: Partial<AgendaReadinessSession> & Pick<AgendaReadinessSession, "id">,
): AgendaReadinessSession {
	return {
		status: "accepted",
		contentStatus: "draft",
		speakerKeys: [],
		slot: null,
		...overrides,
	};
}

const slotA = {
	roomId: "r1",
	roomName: "Main",
	startsAtMs: 1_000,
	endsAtMs: 2_000,
};

const slotOverlap = {
	roomId: "r1",
	roomName: "Main",
	startsAtMs: 1_500,
	endsAtMs: 2_500,
};

describe("agenda readiness predicates", () => {
	it("treats accepted/scheduled/published as programme items", () => {
		expect(isProgrammeSession({ status: "accepted" })).toBe(true);
		expect(isProgrammeSession({ status: "scheduled" })).toBe(true);
		expect(isProgrammeSession({ status: "published" })).toBe(true);
		expect(isProgrammeSession({ status: "withdrawn" })).toBe(false);
		expect(isProgrammeSession({ status: "rejected" })).toBe(false);
	});

	it("requires content_status approved for public approval", () => {
		expect(isContentApproved({ contentStatus: "approved" })).toBe(true);
		expect(isContentApproved({ contentStatus: "draft" })).toBe(false);
		expect(isContentApproved({ contentStatus: null })).toBe(false);
		expect(isContentApproved({})).toBe(false);
	});

	it("counts scheduled only when an agenda slot exists", () => {
		expect(isScheduledOnAgenda({ slot: slotA })).toBe(true);
		expect(isScheduledOnAgenda({ slot: null })).toBe(false);
	});
});

describe("countConflictedSessions", () => {
	it("counts unique sessions in room or speaker conflicts", () => {
		const rows = [
			session({
				id: "a",
				status: "scheduled",
				speakerKeys: ["ada"],
				slot: slotA,
			}),
			session({
				id: "b",
				status: "scheduled",
				speakerKeys: ["bea"],
				slot: slotOverlap,
			}),
			session({ id: "c", status: "accepted", slot: null }),
		];
		expect(countConflictedSessions(rows)).toBe(2);
	});

	it("returns zero when placements do not overlap", () => {
		const rows = [
			session({
				id: "a",
				status: "scheduled",
				slot: slotA,
			}),
			session({
				id: "b",
				status: "scheduled",
				slot: {
					roomId: "r2",
					roomName: "Side",
					startsAtMs: 1_000,
					endsAtMs: 2_000,
				},
			}),
		];
		expect(countConflictedSessions(rows)).toBe(0);
	});
});

describe("buildAgendaReadiness", () => {
	it("builds lifecycle steps with real counts and jump hrefs", () => {
		const rows = [
			session({ id: "a", contentStatus: "approved", status: "published", slot: slotA }),
			session({
				id: "b",
				contentStatus: "approved",
				status: "scheduled",
				speakerKeys: ["x"],
				slot: slotOverlap,
			}),
			session({ id: "c", contentStatus: "draft", status: "accepted", slot: null }),
			session({ id: "d", status: "rejected", slot: null }),
		];

		const steps = buildAgendaReadiness(rows, { eventSlug: "aie" });
		expect(steps.map((step) => step.key)).toEqual([
			"accepted",
			"public_approval",
			"scheduled",
			"conflicts",
			"published",
		]);
		expect(steps.find((step) => step.key === "accepted")).toMatchObject({
			count: 3,
			complete: true,
			href: "/admin/events/aie/submissions?status=accepted",
		});
		expect(steps.find((step) => step.key === "public_approval")).toMatchObject({
			count: 2,
			complete: false,
			href: "/admin/events/aie/content",
		});
		expect(steps.find((step) => step.key === "scheduled")).toMatchObject({
			count: 2,
			complete: false,
			href: "#unplaced",
		});
		expect(steps.find((step) => step.key === "conflicts")).toMatchObject({
			count: 2,
			complete: false,
			href: "#conflicts",
		});
		expect(steps.find((step) => step.key === "published")).toMatchObject({
			count: 1,
			complete: false,
			href: "#publish",
		});
	});

	it("marks the strip complete when every accepted talk is approved, placed, clear, and published", () => {
		const rows = [
			session({
				id: "a",
				status: "published",
				contentStatus: "approved",
				slot: {
					roomId: "r1",
					roomName: "Main",
					startsAtMs: 1_000,
					endsAtMs: 2_000,
				},
			}),
			session({
				id: "b",
				status: "published",
				contentStatus: "approved",
				slot: {
					roomId: "r2",
					roomName: "Side",
					startsAtMs: 1_000,
					endsAtMs: 2_000,
				},
			}),
		];
		const steps = buildAgendaReadiness(rows, { eventSlug: "demo" });
		expect(steps.every((step) => step.complete)).toBe(true);
		expect(steps.map((step) => step.count)).toEqual([2, 2, 2, 0, 2]);
	});

	it("scores Public approval and Published against public-agenda sessions only", () => {
		const rows = [
			session({
				id: "talk",
				status: "published",
				contentStatus: "approved",
				agendaVisibility: "public",
				slot: slotA,
			}),
			session({
				id: "staff-lunch",
				status: "scheduled",
				contentStatus: "draft",
				agendaVisibility: "private",
				slot: {
					roomId: "r2",
					roomName: "Side",
					startsAtMs: 1_000,
					endsAtMs: 2_000,
				},
			}),
		];
		const steps = buildAgendaReadiness(rows, { eventSlug: "aie" });
		expect(steps.find((step) => step.key === "accepted")).toMatchObject({
			count: 2,
			complete: true,
		});
		expect(steps.find((step) => step.key === "scheduled")).toMatchObject({
			count: 2,
			complete: true,
		});
		expect(steps.find((step) => step.key === "public_approval")).toMatchObject({
			count: 1,
			complete: true,
		});
		expect(steps.find((step) => step.key === "published")).toMatchObject({
			count: 1,
			complete: true,
		});
	});

	it("marks Public approval and Published complete when only private service blocks exist", () => {
		const rows = [
			session({
				id: "break",
				status: "scheduled",
				contentStatus: "draft",
				agendaVisibility: "private",
				slot: slotA,
			}),
		];
		const steps = buildAgendaReadiness(rows, { eventSlug: "aie" });
		expect(steps.find((step) => step.key === "accepted")).toMatchObject({
			count: 1,
			complete: true,
		});
		expect(steps.find((step) => step.key === "public_approval")).toMatchObject({
			count: 0,
			complete: true,
		});
		expect(steps.find((step) => step.key === "published")).toMatchObject({
			count: 0,
			complete: true,
		});
	});
});
