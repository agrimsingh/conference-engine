import { describe, expect, it } from "vitest";
import { csvEscape, submissionsToCsv } from "./submissions-csv";

describe("csvEscape", () => {
	it("prefixes formula injection characters", () => {
		expect(csvEscape("=1+1")).toBe("'=1+1");
		expect(csvEscape("+cmd")).toBe("'+cmd");
		expect(csvEscape("-x")).toBe("'-x");
		expect(csvEscape("@sum")).toBe("'@sum");
	});

	it("quotes fields with commas or newlines", () => {
		expect(csvEscape("hello, world")).toBe('"hello, world"');
		expect(csvEscape('say "hi"')).toBe('"say ""hi"""');
	});

	it("leaves plain text unchanged", () => {
		expect(csvEscape("Normal title")).toBe("Normal title");
	});
});

describe("submissionsToCsv", () => {
	it("escapes dangerous cell values in output", () => {
		const csv = submissionsToCsv([
			{
				id: "1",
				title: "=HYPERLINK(\"evil\")",
				status: "submitted",
				category: "Stage",
				speakers: "",
				submitted_at: "",
				labels: "",
			},
		]);
		expect(csv).toContain("'=HYPERLINK");
	});
});
