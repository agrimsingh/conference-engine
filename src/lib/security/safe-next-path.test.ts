import { describe, expect, it } from "vitest";
import { safeNextPath } from "./safe-next-path";

describe("safeNextPath", () => {
	it("keeps safe relative paths including query and hash", () => {
		expect(safeNextPath("/admin")).toBe("/admin");
		expect(safeNextPath("/admin/events/x?foo=1")).toBe("/admin/events/x?foo=1");
		expect(safeNextPath("/admin/events/x?foo=1#section")).toBe("/admin/events/x?foo=1#section");
	});

	it("rejects open-redirect shapes", () => {
		expect(safeNextPath("//evil.com")).toBe("/admin");
		expect(safeNextPath("/\\evil.com")).toBe("/admin");
		expect(safeNextPath("https://evil.com")).toBe("/admin");
		expect(safeNextPath("\\\\evil.com")).toBe("/admin");
	});

	it("falls back for null, empty, and missing values", () => {
		expect(safeNextPath(null)).toBe("/admin");
		expect(safeNextPath(undefined)).toBe("/admin");
		expect(safeNextPath("")).toBe("/admin");
		expect(safeNextPath(null, "/login")).toBe("/login");
	});
});
