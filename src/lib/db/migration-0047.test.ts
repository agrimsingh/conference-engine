import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("0047 CFP duration default", () => {
	it("backfills only compatible duration fields without replacing existing defaults", () => {
		// Given
		const migrationPath = join(process.cwd(), "migrations/0047_cfp_duration_default.sql");

		// When
		const sql = readFileSync(migrationPath, "utf8");

		// Then
		expect(sql).toMatch(/json_set\(config, '\$\.defaultValue', 30\)/);
		expect(sql).toMatch(/key = 'duration_minutes'/);
		expect(sql).toMatch(/json_type\(config, '\$\.defaultValue'\) IS NULL/);
		expect(sql).toMatch(/json_extract\(config, '\$\.min'\) <= 30/);
		expect(sql).toMatch(/json_extract\(config, '\$\.max'\) >= 30/);
		expect(sql).not.toMatch(/DELETE FROM|DROP TABLE/i);
	});
});
