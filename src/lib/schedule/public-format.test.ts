import { describe, expect, it } from "vitest";
import {
	filterPublicEmbedSessions,
	publicSessionFormat,
} from "./public-format";

describe("public session format", () => {
	it("uses the submitted AIE format instead of the submission category", () => {
		const format = publicSessionFormat({ format: "stage" }, "Agents");

		expect(format).toBe("Stage");
	});

	it("keeps a custom submitted format and falls back to the category when format is absent", () => {
		expect(publicSessionFormat({ format: "Panel" }, "Agents")).toBe("Panel");
		expect(publicSessionFormat({}, "Agents")).toBe("Agents");
	});
});

describe("public embed itinerary filters", () => {
	it("keeps only sessions that match every configured filter", () => {
		const sessions = filterPublicEmbedSessions([
			{ id: "stage-agents", trackId: "agents", format: "Stage", room: "Main" },
			{ id: "workshop-agents", trackId: "agents", format: "Workshop", room: "Main" },
			{ id: "stage-platform", trackId: "platform", format: "Stage", room: "Main" },
			{ id: "stage-lab", trackId: "agents", format: "Stage", room: "Lab" },
		], {
			trackIds: ["agents"],
			formats: ["Stage"],
			rooms: ["Main"],
		}).map((session) => session.id);

		expect(sessions).toEqual(["stage-agents"]);
	});
});
