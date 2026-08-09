import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import demoSeed from "../../scripts/seed-demo.sql?raw";
import localSeed from "../../scripts/seed.sql?raw";

async function runSeed(sql: string): Promise<void> {
	const statements = sql
		.split("\n")
		.filter((line) => !line.trimStart().startsWith("--"))
		.join("\n")
		.split(/;\s*(?:\n|$)/)
		.map((statement) => statement.trim())
		.filter(Boolean);
	for (const statement of statements) await env.DB.prepare(statement).run();
}

describe("local seed reset", () => {
	it("declares cleanup for every current application table", async () => {
		// Given: the migrated schema and the tables targeted by the reset seed.
		const schemaTables = await env.DB.prepare(`SELECT name FROM sqlite_schema
			WHERE type = 'table'
				AND name NOT LIKE 'sqlite_%'
				AND name NOT IN ('_cf_METADATA', 'd1_migrations')
			ORDER BY name`).all<{ name: string }>();

		// When: the seed's machine-executed DELETE targets are parsed.
		const resetTables = [...localSeed.matchAll(/^DELETE FROM ([a-z_]+);$/gm)]
			.map((match) => match[1])
			.sort();

		// Then: schema growth cannot silently leave another FK child behind.
		expect(resetTables).toEqual(schemaTables.results.map(({ name }) => name));
	});

	it("replaces a populated current-schema database when the seed is rerun", async () => {
		// Given: both local fixtures have populated the migrated database.
		await runSeed(localSeed);
		await runSeed(demoSeed);

		// When: the base reset seed is executed again.
		await runSeed(localSeed);

		// Then: only the writable local fixture remains and all foreign keys are valid.
		expect(await env.DB.prepare("SELECT slug FROM events ORDER BY slug").all()).toMatchObject({
			results: [{ slug: "aie-sandbox" }],
		});
		expect((await env.DB.prepare("PRAGMA foreign_key_check").all()).results).toEqual([]);
	});
});
