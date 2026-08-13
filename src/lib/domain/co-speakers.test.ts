import { describe, expect, it } from "vitest";
import { speakerRoleLabel } from "./co-speakers";

describe("speakerRoleLabel", () => {
	it("labels the first listed speaker as primary and later speakers as co-authors", () => {
		expect(speakerRoleLabel(0)).toBe("Primary speaker");
		expect(speakerRoleLabel(1)).toBe("Co-author");
		expect(speakerRoleLabel(2)).toBe("Co-author");
	});
});
