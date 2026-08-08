import { applyD1Migrations } from "cloudflare:test";
import { env } from "cloudflare:workers";
import type { D1Migration } from "@cloudflare/vitest-pool-workers";

await applyD1Migrations(env.DB, (env as typeof env & { TEST_MIGRATIONS: D1Migration[] }).TEST_MIGRATIONS);
