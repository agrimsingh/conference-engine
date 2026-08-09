export const MAX_IMPORT_BYTES = 512 * 1024;
export const MAX_IMPORT_ROWS = 250;
export const MAX_IMPORT_COLUMNS = 20;

export type CsvRecord = Record<string, string>;

export type CsvParseResult =
	| { ok: true; headers: string[]; rows: CsvRecord[] }
	| { ok: false; error: string };

/** A deliberately small RFC-4180 parser. It rejects malformed quotes rather
 * than guessing, which keeps a preview identical to the eventual commit. */
export function parseBoundedCsv(input: string): CsvParseResult {
	if (new TextEncoder().encode(input).byteLength > MAX_IMPORT_BYTES) {
		return { ok: false, error: `CSV must be at most ${MAX_IMPORT_BYTES / 1024} KB` };
	}
	const rows: string[][] = [];
	let row: string[] = [];
	let field = "";
	let quoted = false;
	for (let index = 0; index < input.length; index += 1) {
		const char = input[index]!;
		if (quoted) {
			if (char === '"') {
				if (input[index + 1] === '"') { field += '"'; index += 1; }
				else quoted = false;
			} else field += char;
			continue;
		}
		if (char === '"') {
			if (field) return { ok: false, error: `Unexpected quote on row ${rows.length + 1}` };
			quoted = true;
		} else if (char === ",") {
			row.push(field); field = "";
		} else if (char === "\n" || char === "\r") {
			if (char === "\r" && input[index + 1] === "\n") index += 1;
			row.push(field); field = "";
			if (row.some((value) => value.length > 0)) rows.push(row);
			row = [];
		} else field += char;
	}
	if (quoted) return { ok: false, error: "Unclosed quoted field in CSV" };
	row.push(field);
	if (row.some((value) => value.length > 0)) rows.push(row);
	if (rows.length === 0) return { ok: false, error: "CSV is empty" };
	const headers = rows.shift()!.map((value) => value.replace(/^\uFEFF/, "").trim().toLowerCase());
	if (headers.length === 0 || headers.length > MAX_IMPORT_COLUMNS) return { ok: false, error: "CSV has an invalid number of columns" };
	if (new Set(headers).size !== headers.length || headers.some((header) => !header)) return { ok: false, error: "CSV headers must be unique and non-empty" };
	if (rows.length > MAX_IMPORT_ROWS) return { ok: false, error: `CSV may contain at most ${MAX_IMPORT_ROWS} rows` };
	if (rows.some((values) => values.length !== headers.length)) return { ok: false, error: "Every CSV row must have the same number of columns as the header" };
	return { ok: true, headers, rows: rows.map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""]))) };
}

/** Spreadsheet programs execute values starting with these prefixes. Rejecting
 * them at import means the same data stays safe if organizers later export it. */
export function hasFormulaPrefix(value: string): boolean {
	return /^[=+\-@]/.test(value.trimStart());
}
