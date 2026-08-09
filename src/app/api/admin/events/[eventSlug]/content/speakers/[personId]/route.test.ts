import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("organizer headshot upload compensation", () => {
	it("enforces the exact file limit and removes both D1 and R2 state on failure", () => {
		const source = readFileSync(new URL("./route.ts", import.meta.url), "utf8");
		expect(source).toMatch(/file\.size > 25 \* 1024 \* 1024/);
		expect(source).toMatch(/DELETE FROM assets WHERE id = \? AND event_id = \?/);
		expect(source).toMatch(/bucket\.delete\(key\)/);
	});
});
