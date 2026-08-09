import { describe, expect, it } from "vitest";
import { parseSpeakerSocial, serializeSpeakerSocial } from "./social";

describe("speaker social_json", () => {
	it("round-trips known keys including facebook and drops empties", () => {
		const json = serializeSpeakerSocial({
			twitter: " @pat ",
			linkedin: "",
			github: "pat",
			website: "https://example.com",
			facebook: " https://facebook.com/pat ",
			ignored: "nope",
		});
		expect(json).toBe(JSON.stringify({
			twitter: "@pat",
			github: "pat",
			website: "https://example.com",
			facebook: "https://facebook.com/pat",
		}));
		expect(parseSpeakerSocial(json)).toEqual({
			twitter: "@pat",
			github: "pat",
			website: "https://example.com",
			facebook: "https://facebook.com/pat",
		});
	});

	it("returns null for empty social payloads", () => {
		expect(serializeSpeakerSocial({})).toBeNull();
		expect(serializeSpeakerSocial({ twitter: "   " })).toBeNull();
		expect(parseSpeakerSocial(null)).toEqual({});
	});
});
