import { describe, expect, it } from "vitest";
import { validatedAppOrigin } from "./origin";

describe("APP_ORIGIN validation", () => {
	it("accepts only a bare http(s) origin", () => {
		expect(validatedAppOrigin("https://conference.example")).toBe("https://conference.example");
		expect(validatedAppOrigin("http://localhost:3000")).toBe("http://localhost:3000");
		expect(validatedAppOrigin("https://conference.example/portal")).toBeNull();
		expect(validatedAppOrigin("javascript:alert(1)")).toBeNull();
	});
});
