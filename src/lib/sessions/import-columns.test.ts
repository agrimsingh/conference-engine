import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseBoundedCsv } from "./csv";
import {
	canonicalizeCsvRecord,
	csvHasTitleColumn,
	normalizeImportHeader,
	resolveImportField,
	SESSION_IMPORT_ALIASES,
} from "./import-columns";
import { inputFromCsvRow, normalizeSessionInput } from "./session";

describe("Sessionboard import column aliases", () => {
	it("maps Sessionboard standard labels to canonical fields", () => {
		expect(resolveImportField("Title")).toBe("title");
		expect(resolveImportField("Session Title")).toBe("title");
		expect(resolveImportField("Description")).toBe("abstract");
		expect(resolveImportField("Track")).toBe("track");
		expect(resolveImportField("First Name")).toBe("first_name");
		expect(resolveImportField("Last Name")).toBe("last_name");
		expect(resolveImportField("Email")).toBe("speaker_email");
		expect(resolveImportField("Biography")).toBe("speaker_bio");
		expect(resolveImportField("speaker_name")).toBe("speaker_name");
		expect(normalizeImportHeader("speaker_name")).toBe("speaker name");
		expect(SESSION_IMPORT_ALIASES[normalizeImportHeader("speaker_name")]).toBe("speaker_name");
	});

	it("accepts title via Sessionboard alias for the required-column gate", () => {
		expect(csvHasTitleColumn(["session title", "description"])).toBe(true);
		expect(csvHasTitleColumn(["title"])).toBe(true);
		expect(csvHasTitleColumn(["description", "track"])).toBe(false);
	});

	it("canonicalizes a Sessionboard-shaped row into SessionInput", () => {
		const input = inputFromCsvRow({
			"session title": "Agents at work",
			description: "A field report.",
			track: "Main Stage",
			"first name": "Ada",
			"last name": "Lovelace",
			email: "ada@example.test",
			biography: "Wrote notes on the engine.",
			"video url": "https://video.example.test/agents",
		});
		expect(input).toEqual({
			title: "Agents at work",
			abstract: "A field report.",
			category: "Main Stage",
			videoUrl: "https://video.example.test/agents",
			googleDocUrl: "",
			supportingUrl: "",
			speakers: [{ name: "Ada Lovelace", email: "ada@example.test", bio: "Wrote notes on the engine." }],
		});
		expect(normalizeSessionInput(input)).toMatchObject({ ok: true });
	});

	it("keeps existing snake_case headers working (first non-empty wins)", () => {
		const c = canonicalizeCsvRecord({
			title: "Legacy",
			"session title": "Ignored alias",
			abstract: "From abstract",
			description: "Ignored description",
			speaker_name: "Imani",
			speaker_email: "imani@example.test",
		});
		expect(c.title).toBe("Legacy");
		expect(c.abstract).toBe("From abstract");
		expect(inputFromCsvRow({
			title: "Legacy",
			speaker_name: "Imani",
			speaker_email: "imani@example.test",
		})).toMatchObject({
			title: "Legacy",
			speakers: [{ name: "Imani", email: "imani@example.test", bio: "" }],
		});
	});

	it("imports the demo Sessionboard fixture CSV end-to-end through the parser", () => {
		const csv = readFileSync(join(process.cwd(), "test/fixtures/sessionboard-sessions.csv"), "utf8");
		const parsed = parseBoundedCsv(csv);
		expect(parsed.ok).toBe(true);
		if (!parsed.ok) return;
		expect(csvHasTitleColumn(parsed.headers)).toBe(true);
		const rows = parsed.rows.map((row) => inputFromCsvRow(row));
		expect(rows).toHaveLength(3);
		expect(rows[0]).toMatchObject({
			title: "Opening Keynote",
			category: "Main Stage",
			speakers: [{ name: "Ada Lovelace", email: "ada.lovelace@example.test" }],
		});
		expect(rows.every((row) => normalizeSessionInput(row).ok)).toBe(true);
	});
});
