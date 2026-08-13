import { spawn } from "node:child_process";
import { once } from "node:events";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const defaultRootDir = path.resolve(scriptDir, "..");
const ownerWorkerName = "conference-engine-event-room-dev";
const defaultOwnerPort = 8790;
const defaultInspectorPort = 9230;
const readyTimeoutMs = 20_000;
const shutdownTimeoutMs = 5_000;

function portFromEnvironment(name, fallback) {
	const value = process.env[name];
	if (value === undefined) return fallback;
	const port = Number(value);
	if (!Number.isInteger(port) || port < 1 || port > 65_535) {
		throw new Error(`${name} must be an integer between 1 and 65535`);
	}
	return port;
}

function exitCodeForSignal(signal) {
	if (signal === "SIGINT") return 130;
	if (signal === "SIGTERM") return 143;
	return 1;
}

function persistenceRoot(rootDir) {
	return process.env.CE_WRANGLER_PERSIST_ROOT
		? path.resolve(process.env.CE_WRANGLER_PERSIST_ROOT)
		: path.join(rootDir, ".wrangler/state");
}

export function buildDevPlan({ rootDir = defaultRootDir, nextArgs = [], ownerPort = defaultOwnerPort, inspectorPort = defaultInspectorPort } = {}) {
	const basePersistenceRoot = persistenceRoot(rootDir);
	return {
		owner: {
			command: process.execPath,
			args: [
				path.join(rootDir, "node_modules/wrangler/bin/wrangler.js"),
				"dev",
				"--config", path.join(rootDir, "wrangler.event-room-dev.jsonc"),
				"--local",
				"--ip", "127.0.0.1",
				"--port", String(ownerPort),
				"--inspector-port", String(inspectorPort),
				"--persist-to", basePersistenceRoot,
				"--log-level", "warn",
			],
		},
		next: {
			command: process.execPath,
			args: [path.join(rootDir, "node_modules/next/dist/bin/next"), "dev", ...nextArgs],
		},
		ownerUrl: `http://127.0.0.1:${ownerPort}/`,
		ownerWorkerName,
		basePersistenceRoot,
	};
}

function startChild(command, args, rootDir) {
	return spawn(command, args, {
		cwd: rootDir,
		detached: process.platform !== "win32",
		stdio: "inherit",
	});
}

async function waitForOwnerReady(owner, ownerUrl) {
	const deadline = Date.now() + readyTimeoutMs;
	while (Date.now() < deadline) {
		if (owner.exitCode !== null || owner.signalCode !== null) {
			const reason = owner.signalCode === null ? `code ${owner.exitCode}` : `signal ${owner.signalCode}`;
			throw new Error(`EventRoom owner exited before readiness with ${reason}`);
		}
		try {
			const response = await fetch(ownerUrl, { signal: AbortSignal.timeout(500) });
			if (response.status === 200) return;
		} catch (error) {
			if (!(error instanceof Error)) throw error;
		}
		await new Promise((resolve) => setTimeout(resolve, 100));
	}
	throw new Error(`EventRoom owner did not become ready within ${readyTimeoutMs}ms`);
}

function stopChild(child, signal) {
	if (child.exitCode !== null || child.pid === undefined) return;
	if (process.platform !== "win32") {
		try {
			process.kill(-child.pid, signal);
			return;
		} catch (error) {
			if (!(error instanceof Error) || error.code !== "ESRCH") throw error;
		}
	}
	child.kill(signal);
}

async function stopChildren(children) {
	for (const child of children) stopChild(child, "SIGTERM");
	await Promise.race([
		Promise.all(children.map(async (child) => {
			if (child.exitCode === null) await once(child, "exit");
		})),
		new Promise((resolve) => setTimeout(resolve, shutdownTimeoutMs)),
	]);
	for (const child of children) stopChild(child, "SIGKILL");
}

async function main() {
	const rootDir = defaultRootDir;
	const plan = buildDevPlan({
		rootDir,
		nextArgs: process.argv.slice(2),
		ownerPort: portFromEnvironment("CE_EVENT_ROOM_DEV_PORT", defaultOwnerPort),
		inspectorPort: portFromEnvironment("CE_EVENT_ROOM_INSPECTOR_PORT", defaultInspectorPort),
	});
	const children = [];
	let shuttingDown = false;
	let exitCode = 0;
	let shutdownPromise;
	const shutdown = async (code) => {
		if (shutdownPromise) return shutdownPromise;
		shuttingDown = true;
		exitCode = code;
		shutdownPromise = stopChildren(children);
		return shutdownPromise;
	};
	process.once("SIGINT", () => { void shutdown(130); });
	process.once("SIGTERM", () => { void shutdown(143); });

	const owner = startChild(plan.owner.command, plan.owner.args, rootDir);
	children.push(owner);
	owner.once("exit", (code, signal) => {
		if (!shuttingDown) void shutdown(code ?? exitCodeForSignal(signal));
	});
	try {
		await waitForOwnerReady(owner, plan.ownerUrl);
		const next = startChild(plan.next.command, plan.next.args, rootDir);
		children.push(next);
		const nextExit = once(next, "exit");
		nextExit.then(([code, signal]) => {
			if (!shuttingDown) void shutdown((typeof code === "number" ? code : null) ?? exitCodeForSignal(typeof signal === "string" ? signal : null));
		});
		await nextExit;
	} finally {
		await shutdown(exitCode);
	}
	process.exitCode = exitCode;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
	main().catch((error) => {
		if (error instanceof Error) console.error(error.message);
		else console.error(error);
		process.exitCode = 1;
	});
}
