import { describe, expect, it } from "vitest";
import { csvEscape, submissionsToCsv } from "./submissions-csv";

describe("csvEscape", () => {
	it("prefixes formula injection characters", () => {
		expect(csvEscape("=1+1")).toBe("'=1+1");
		expect(csvEscape("+cmd")).toBe("'+cmd");
		expect(csvEscape("-x")).toBe("'-x");
		expect(csvEscape("@sum")).toBe("'@sum");
	});

	it("prefixes tab and CR formula starters", () => {
		expect(csvEscape("\tformula")).toBe("'\tformula");
		// CR also triggers CSV quoting after the formula prefix.
		expect(csvEscape("\rformula")).toBe("\"'\rformula\"");
	});

	it("quotes fields with commas or newlines", () => {
		expect(csvEscape("hello, world")).toBe('"hello, world"');
		expect(csvEscape('say "hi"')).toBe('"say ""hi"""');
		expect(csvEscape("line1\nline2")).toBe('"line1\nline2"');
	});

	it("leaves plain text unchanged", () => {
		expect(csvEscape("Normal title")).toBe("Normal title");
	});

	it("quotes formula-escaped values that also need CSV quoting", () => {
		expect(csvEscape("=1,2")).toBe("\"'=1,2\"");
	});
});

describe("submissionsToCsv", () => {
	it("escapes dangerous cell values in output", () => {
		const csv = submissionsToCsv([
			{
				id: "1",
				title: '=HYPERLINK("evil")',
				status: "submitted",
				category: "Stage",
				speakers: "",
				submitted_at: "",
				labels: "",
			},
		]);
		expect(csv).toContain("'=HYPERLINK");
	});

	it("emits header row and one data row", () => {
		const csv = submissionsToCsv([
			{
				id: "sub-1",
				title: "Talk",
				status: "accepted",
				category: "Workshop",
				speakers: "Ada",
				submitted_at: "2026-01-01T00:00:00.000Z",
				labels: "vip",
			},
		]);
		const lines = csv.trimEnd().split("\n");
		expect(lines[0]).toBe(
			"id,title,status,category,speakers,submitted_at,labels",
		);
		expect(lines[1]).toBe(
			"sub-1,Talk,accepted,Workshop,Ada,2026-01-01T00:00:00.000Z,vip",
		);
	});

	it("returns header-only CSV for empty input", () => {
		expect(submissionsToCsv([])).toBe(
			"id,title,status,category,speakers,submitted_at,labels\n",
		);
	});
});
