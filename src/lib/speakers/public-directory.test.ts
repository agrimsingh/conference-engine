import { describe, expect, it } from "vitest";
import {
	compareSpeakersBySurname,
	filterSpeakersByQuery,
	sortSpeakersBySurname,
	speakerAffiliation,
	speakerRoleLine,
	speakerSurname,
} from "./public-directory";

describe("public speaker directory helpers", () => {
	it("extracts surname as last token", () => {
		expect(speakerSurname("Pat Public")).toBe("public");
		expect(speakerSurname("Madonna")).toBe("madonna");
		expect(speakerSurname("  Ada  Lovelace  ")).toBe("lovelace");
		expect(speakerSurname("   ")).toBe("");
	});

	it("sorts by surname then display name", () => {
		const sorted = sortSpeakersBySurname([
			{ displayName: "Zack Alpha" },
			{ displayName: "Ann Beta" },
			{ displayName: "Mia Alpha" },
		]);
		expect(sorted.map((s) => s.displayName)).toEqual([
			"Mia Alpha",
			"Zack Alpha",
			"Ann Beta",
		]);
		expect(compareSpeakersBySurname({ displayName: "A" }, { displayName: "B" })).toBeLessThan(0);
	});

	it("filters by name, job title, or company", () => {
		const speakers = [
			{ displayName: "Pat Public", jobTitle: "Engineer", company: "Acme" },
			{ displayName: "Sam Speaker", jobTitle: null, company: "Widgets Co" },
		];
		expect(filterSpeakersByQuery(speakers, "acme").map((s) => s.displayName)).toEqual([
			"Pat Public",
		]);
		expect(filterSpeakersByQuery(speakers, "sam").map((s) => s.displayName)).toEqual([
			"Sam Speaker",
		]);
		expect(filterSpeakersByQuery(speakers, "")).toHaveLength(2);
	});

	it("formats affiliation gracefully when fields missing", () => {
		expect(speakerAffiliation({ jobTitle: "CTO", company: "Acme" })).toBe("CTO, Acme");
		expect(speakerAffiliation({ jobTitle: "CTO", company: null })).toBe("CTO");
		expect(speakerAffiliation({ jobTitle: null, company: "Acme" })).toBe("Acme");
		expect(speakerAffiliation({ jobTitle: null, company: null })).toBeNull();
	});

	it("formats schedule/discover role line under speaker name", () => {
		expect(speakerRoleLine({ jobTitle: "CTO", company: "Acme" })).toBe("CTO · Acme");
		expect(speakerRoleLine({ jobTitle: "CTO", company: null })).toBe("CTO");
		expect(speakerRoleLine({ jobTitle: null, company: "Acme" })).toBe("Acme");
		expect(speakerRoleLine({ jobTitle: "  ", company: null })).toBeNull();
		expect(speakerRoleLine({ jobTitle: null, company: null })).toBeNull();
	});
});
