import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

const rootDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
	plugins: [
		cloudflareTest(async () => {
			const [migrations, preflightSql] = await Promise.all([
				readD1Migrations(path.join(rootDir, "migrations")),
				readFile(path.join(rootDir, "scripts/preflight-production.sql"), "utf8"),
			]);
			return {
				wrangler: { configPath: "./wrangler.vitest.jsonc" },
				miniflare: {
					bindings: {
						AUTH_SECRET: "worker-test-auth-secret",
						TEST_MIGRATIONS: migrations,
						TEST_PREFLIGHT_SQL: preflightSql,
					},
				},
			};
		}),
	],
	resolve: {
		alias: {
			"@": path.resolve(rootDir, "./src"),
		},
	},
	test: {
		include: ["test/workers/**/*.test.ts"],
		setupFiles: ["./test/workers/apply-migrations.ts"],
	},
});
