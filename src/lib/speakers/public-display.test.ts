import { describe, expect, it } from "vitest";
import {
	isPublicTbaSpeaker,
	PUBLIC_TBA_SPEAKER_NAME,
	publicSessionSpeakers,
	type PublicSpeakerSource,
} from "./public-display";

function source(
	overrides: Partial<PublicSpeakerSource> & Pick<PublicSpeakerSource, "status" | "name">,
): PublicSpeakerSource {
	return { personId: null, ...overrides };
}

const tba = {
	kind: "tba" as const,
	personId: null,
	name: PUBLIC_TBA_SPEAKER_NAME,
};

describe("publicSessionSpeakers", () => {
	it("keeps confirmed speakers with real names", () => {
		expect(
			publicSessionSpeakers([
				source({ status: "confirmed", personId: "p1", name: "Ada Lovelace" }),
				source({ status: "confirmed", personId: "p2", name: "  Alan Turing  " }),
			]),
		).toEqual([
			{ kind: "named", personId: "p1", name: "Ada Lovelace" },
			{ kind: "named", personId: "p2", name: "Alan Turing" },
		]);
	});

	it("collapses pending-only sessions to one TBA placeholder", () => {
		expect(
			publicSessionSpeakers([
				source({ status: "pending", name: "Secret One" }),
				source({ status: "pending", personId: "hidden", name: "Secret Two" }),
			]),
		).toEqual([tba]);
	});

	it("shows confirmed names plus one TBA when mixed with pending", () => {
		expect(
			publicSessionSpeakers([
				source({ status: "confirmed", personId: "p1", name: "Ada Lovelace" }),
				source({ status: "pending", name: "Not Yet" }),
				source({ status: "pending", name: "Also Pending" }),
			]),
		).toEqual([
			{ kind: "named", personId: "p1", name: "Ada Lovelace" },
			tba,
		]);
	});

	it("uses one TBA when a published session has no speakers", () => {
		expect(publicSessionSpeakers([])).toEqual([tba]);
	});

	it("omits declined and removed, and still TBAs when nobody confirmed", () => {
		expect(
			publicSessionSpeakers([
				source({ status: "declined", personId: "d1", name: "Declined Person" }),
				source({ status: "removed", personId: "r1", name: "Removed Person" }),
			]),
		).toEqual([tba]);
	});

	it("omits declined beside confirmed without adding TBA", () => {
		expect(
			publicSessionSpeakers([
				source({ status: "confirmed", personId: "p1", name: "Ada Lovelace" }),
				source({ status: "declined", name: "Nope" }),
				source({ status: "removed", name: "Gone" }),
			]),
		).toEqual([{ kind: "named", personId: "p1", name: "Ada Lovelace" }]);
	});

	it("treats invited/unconfirmed statuses as unnamed", () => {
		expect(
			publicSessionSpeakers([
				source({ status: "invited", name: "Invitee" }),
				source({ status: "confirmed", personId: "p1", name: "Ada Lovelace" }),
			]),
		).toEqual([
			{ kind: "named", personId: "p1", name: "Ada Lovelace" },
			tba,
		]);
	});

	it("exposes TBA placeholder fields without identity", () => {
		const [placeholder] = publicSessionSpeakers([source({ status: "pending", name: "Hidden" })]);
		expect(placeholder).toEqual(tba);
		expect(placeholder?.personId).toBeNull();
		expect(placeholder?.name).toBe("Speaker to be announced");
		expect(isPublicTbaSpeaker(placeholder!)).toBe(true);
		expect(
			isPublicTbaSpeaker({ personId: "p1", name: PUBLIC_TBA_SPEAKER_NAME }),
		).toBe(false);
	});

	it("falls back to Speaker for a confirmed blank name", () => {
		expect(publicSessionSpeakers([source({ status: "confirmed", name: "   " })])).toEqual([
			{ kind: "named", personId: null, name: "Speaker" },
		]);
	});
});
