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
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const passthrough = process.argv.slice(2);
const repositoryRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const EXACT_GIT_SHA = /^[0-9a-f]{40}$/i;

function fail(message) {
	process.stderr.write(`${message}\n`);
	process.exit(1);
}

function gitOutput(args) {
	const result = spawnSync("git", args, {
		cwd: repositoryRoot,
		encoding: "utf8",
		shell: process.platform === "win32",
	});
	if (result.status !== 0 || result.error) fail("Unable to read git release provenance.");
	return result.stdout.trim();
}

function run(command, args, env) {
	const result = spawnSync(command, args, {
		stdio: "inherit",
		env,
		cwd: repositoryRoot,
		shell: process.platform === "win32",
	});
	if (result.status !== 0) {
		process.exit(result.status ?? 1);
	}
}

const worktreeStatus = gitOutput(["status", "--porcelain"]);
if (worktreeStatus) fail("Refusing to deploy a dirty git worktree. Commit or stash changes first.");

const revision = gitOutput(["rev-parse", "--verify", "HEAD^{commit}"]);
if (!EXACT_GIT_SHA.test(revision)) fail("Unable to determine an exact git commit for this release.");

const buildEnv = { ...process.env, NEXT_PUBLIC_BUILD_SHA: revision };

run("npx", ["opennextjs-cloudflare", "build"], buildEnv);
run(
	"npx",
	["wrangler", "deploy", ...passthrough],
	{ ...buildEnv, OPEN_NEXT_DEPLOY: "true" },
);
