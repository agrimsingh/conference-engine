import { describe, expect, it } from "vitest";
import { hasFormulaPrefix, parseBoundedCsv } from "./csv";
import { normalizeSessionInput, safeExternalUrl } from "./session";

describe("session CSV safety", () => {
	it("parses quoted cells without treating embedded newlines as rows", () => {
		expect(parseBoundedCsv('title,abstract\n"A talk","line one\nline two"')).toEqual({ ok: true, headers: ["title", "abstract"], rows: [{ title: "A talk", abstract: "line one\nline two" }] });
	});

	it("rejects formula-prefixed import values and unsafe resource URLs", () => {
		expect(hasFormulaPrefix(" =SUM(A1:A2)")).toBe(true);
		expect(normalizeSessionInput({ title: "=HYPERLINK(\"https://bad\")" })).toMatchObject({ ok: false });
		expect(normalizeSessionInput({ title: "Safe", videoUrl: "javascript:alert(1)" })).toMatchObject({ ok: false });
		expect(safeExternalUrl("https://example.test/video")).toBe("https://example.test/video");
		expect(safeExternalUrl("data:text/html,unsafe")).toBeNull();
	});

	it("enforces the documented 512 KB, 250-row, and 20-column limits", () => {
		const exactly512Kb = `title\n${"x".repeat(512 * 1024 - 6)}`;
		expect(parseBoundedCsv(exactly512Kb).ok).toBe(true);
		expect(parseBoundedCsv(`${exactly512Kb}x`)).toMatchObject({ ok: false, error: expect.stringMatching(/512 KB/) });
		const headers = Array.from({ length: 20 }, (_, index) => `column_${index}`).join(",");
		expect(parseBoundedCsv(`${headers}\n${Array(20).fill("value").join(",")}`).ok).toBe(true);
		expect(parseBoundedCsv(`${headers},extra\n${Array(21).fill("value").join(",")}`)).toMatchObject({ ok: false, error: expect.stringMatching(/columns/) });
		const rows250 = `title\n${Array.from({ length: 250 }, (_, index) => `Talk ${index}`).join("\n")}`;
		expect(parseBoundedCsv(rows250).ok).toBe(true);
		expect(parseBoundedCsv(`${rows250}\nToo many`)).toMatchObject({ ok: false, error: expect.stringMatching(/250 rows/) });
	});
});
