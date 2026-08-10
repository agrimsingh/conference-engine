import { describe, expect, it } from "vitest";
import { preferPipelineStage } from "./merge";

describe("preferPipelineStage", () => {
	it("fills gaps from whichever side has a stage", () => {
		expect(preferPipelineStage(null, "outreach")).toBe("outreach");
		expect(preferPipelineStage("confirmed", null)).toBe("confirmed");
	});

	it("keeps the later kanban stage when both are enrolled", () => {
		expect(preferPipelineStage("research", "negotiating")).toBe("negotiating");
		expect(preferPipelineStage("confirmed", "outreach")).toBe("confirmed");
		expect(preferPipelineStage("declined", "confirmed")).toBe("declined");
	});
});
