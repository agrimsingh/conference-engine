import { describe, expect, it } from "vitest";
import { SUBMISSION_EXPORT_HEADERS, type SubmissionExportRow } from "./submissions-csv";
import { submissionsToXlsx } from "./submissions-xlsx";

const sampleRow: SubmissionExportRow = {
	id: "sub-1",
	title: "=cmd()",
	status: "submitted",
	category: "talk",
	speakers: "Ada Lovelace",
	submitted_at: "2027-01-01T00:00:00.000Z",
	labels: "priority",
};

describe("submissions XLSX", () => {
	it("packages the same headers and rows as CSV inside sheet1.xml", () => {
		const xlsx = submissionsToXlsx([sampleRow]);
		const text = new TextDecoder().decode(xlsx);

		expect(text).toContain("xl/worksheets/sheet1.xml");
		expect(Array.from(xlsx.slice(-22, -18))).toEqual([0x50, 0x4b, 0x05, 0x06]);

		for (const header of SUBMISSION_EXPORT_HEADERS) {
			expect(text).toContain(`>${header}<`);
		}
		expect(text).toContain(">&apos;=cmd()<");
		expect(text).toContain(">Ada Lovelace<");
		expect(text).toContain(">sub-1<");
	});

	it("produces a valid empty workbook when there are no rows", () => {
		const xlsx = submissionsToXlsx([]);
		const text = new TextDecoder().decode(xlsx);
		expect(text).toContain(">id<");
		expect(text).toContain("Submissions");
	});
});
