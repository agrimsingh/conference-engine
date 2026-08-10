#!/usr/bin/env node
/**
 * OpenNext deploy without getPlatformProxy.
 *
 * `opennextjs-cloudflare deploy` spins up getPlatformProxy to read string env
 * vars. That preflight loads a stub worker and prints a false-positive
 * "EventRoom is not exported" warning even though `worker.ts` exports the
 * class and production DO calls work.
 *
 * Flow: build → wrangler deploy with OPEN_NEXT_DEPLOY=true (blocks wrangler's
 * OpenNext recursion into opennextjs-cloudflare deploy).
 */
import { spawnSync } from "node:child_process";

const passthrough = process.argv.slice(2);

function run(command, args, env = process.env) {
	const result = spawnSync(command, args, {
		stdio: "inherit",
		env,
		shell: process.platform === "win32",
	});
	if (result.status !== 0) {
		process.exit(result.status ?? 1);
	}
}

run("npx", ["opennextjs-cloudflare", "build"]);
run(
	"npx",
	["wrangler", "deploy", ...passthrough],
	{ ...process.env, OPEN_NEXT_DEPLOY: "true" },
);
