import { buildStoredZip } from "@/lib/content/zip";
import {
	SUBMISSION_EXPORT_HEADERS,
	type SubmissionExportRow,
} from "./submissions-csv";

function xmlEscape(value: string): string {
	return value
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;")
		.replaceAll("'", "&apos;");
}

function spreadsheetSafe(value: string): string {
	return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}

function colLetter(index: number): string {
	let n = index;
	let out = "";
	do {
		out = String.fromCharCode(65 + (n % 26)) + out;
		n = Math.floor(n / 26) - 1;
	} while (n >= 0);
	return out;
}

function cellInlineStr(ref: string, value: string): string {
	return `<c r="${ref}" t="inlineStr"><is><t>${xmlEscape(spreadsheetSafe(value))}</t></is></c>`;
}

function sheetXml(rows: SubmissionExportRow[]): string {
	const headerCells = SUBMISSION_EXPORT_HEADERS.map((header, index) =>
		cellInlineStr(`${colLetter(index)}1`, header),
	).join("");
	const body = rows
		.map((row, rowIndex) => {
			const r = rowIndex + 2;
			const cells = SUBMISSION_EXPORT_HEADERS.map((header, index) =>
				cellInlineStr(`${colLetter(index)}${r}`, row[header]),
			).join("");
			return `<row r="${r}">${cells}</row>`;
		})
		.join("");
	return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1">${headerCells}</row>${body}</sheetData></worksheet>`;
}

export function submissionsToXlsx(rows: SubmissionExportRow[]): Uint8Array {
	const enc = new TextEncoder();
	return buildStoredZip([
		{
			path: "[Content_Types].xml",
			bytes: enc.encode(
				`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`,
			),
		},
		{
			path: "_rels/.rels",
			bytes: enc.encode(
				`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
			),
		},
		{
			path: "xl/workbook.xml",
			bytes: enc.encode(
				`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Submissions" sheetId="1" r:id="rId1"/></sheets></workbook>`,
			),
		},
		{
			path: "xl/_rels/workbook.xml.rels",
			bytes: enc.encode(
				`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`,
			),
		},
		{ path: "xl/worksheets/sheet1.xml", bytes: enc.encode(sheetXml(rows)) },
	]);
}
