import { execFileSync, spawnSync } from "node:child_process";
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repositoryRoot = fileURLToPath(new URL("../../../", import.meta.url));
const deployScriptSource = join(repositoryRoot, "scripts/cf-deploy.mjs");

type DeployFixture = {
	readonly root: string;
	readonly scriptPath: string;
	readonly callLogPath: string;
	readonly env: NodeJS.ProcessEnv;
};

async function createDeployFixture(): Promise<DeployFixture> {
	const root = await mkdtemp(join(tmpdir(), "conference-engine-cf-deploy-"));
	const scriptsDir = join(root, "scripts");
	const binDir = join(root, "bin");
	const scriptPath = join(scriptsDir, "cf-deploy.mjs");
	const callLogPath = join(root, "npx-calls.log");
	await Promise.all([mkdir(scriptsDir), mkdir(binDir)]);
	await Promise.all([
		writeFile(scriptPath, await readFile(deployScriptSource, "utf8")),
		writeFile(join(root, "package.json"), "{}\n"),
		writeFile(join(root, "tracked.txt"), "clean\n"),
		writeFile(
			join(binDir, "npx"),
			'#!/bin/sh\nprintf "%s|%s\\n" "$*" "$NEXT_PUBLIC_BUILD_SHA" >> "$CALLS_LOG"\n',
		),
	]);
	await chmod(join(binDir, "npx"), 0o755);
	execFileSync("git", ["init", "--quiet"], { cwd: root });
	execFileSync("git", ["config", "user.email", "release-test@example.test"], { cwd: root });
	execFileSync("git", ["config", "user.name", "Release test"], { cwd: root });
	execFileSync("git", ["add", "."], { cwd: root });
	execFileSync("git", ["commit", "--quiet", "-m", "fixture"], { cwd: root });

	return {
		root,
		scriptPath,
		callLogPath,
		env: { ...process.env, CALLS_LOG: callLogPath, PATH: `${binDir}:${process.env.PATH ?? ""}` },
	};
}

describe("cf-deploy", () => {
	it("passes the clean repository's exact SHA into both OpenNext build and Wrangler deploy", async () => {
		// Given: a clean, committed checkout and an npx recorder in PATH.
		const fixture = await createDeployFixture();
		try {
			const revision = execFileSync("git", ["rev-parse", "HEAD"], { cwd: fixture.root, encoding: "utf8" }).trim();

			// When: the deploy wrapper runs with a Wrangler flag.
			const result = spawnSync(process.execPath, [fixture.scriptPath, "--dry-run"], {
				cwd: fixture.root,
				env: fixture.env,
				encoding: "utf8",
			});

			// Then: both phases receive the same immutable revision.
			expect(result.status).toBe(0);
			expect((await readFile(fixture.callLogPath, "utf8")).trim().split("\n")).toEqual([
				`opennextjs-cloudflare build|${revision}`,
				`wrangler deploy --dry-run|${revision}`,
			]);
		} finally {
			await rm(fixture.root, { recursive: true, force: true });
		}
	});

	it("refuses to deploy a checkout with uncommitted code", async () => {
		// Given: a committed checkout that has changed after its last revision.
		const fixture = await createDeployFixture();
		try {
			await writeFile(join(fixture.root, "tracked.txt"), "dirty\n");

			// When: the deploy wrapper is invoked.
			const result = spawnSync(process.execPath, [fixture.scriptPath], {
				cwd: fixture.root,
				env: fixture.env,
				encoding: "utf8",
			});

			// Then: it exits before OpenNext or Wrangler can publish untracked code.
			expect(result.status).toBe(1);
			expect(result.stderr).toContain("Refusing to deploy a dirty git worktree");
			expect(await readFile(fixture.callLogPath, "utf8").catch(() => "")).toBe("");
		} finally {
			await rm(fixture.root, { recursive: true, force: true });
		}
	});
});
