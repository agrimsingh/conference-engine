import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const ownerWorkerName = "conference-engine-event-room-dev";

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function recordArray(value: unknown, description: string): readonly Record<string, unknown>[] {
	if (!Array.isArray(value) || !value.every(isRecord)) {
		throw new Error(`${description} must be an array of objects`);
	}
	return value;
}

async function readJsonConfig(name: string): Promise<Record<string, unknown>> {
	const source = await readFile(path.join(projectRoot, name), "utf8");
	const parsed: unknown = JSON.parse(source);
	if (!isRecord(parsed)) throw new Error(`${name} must contain a JSON object`);
	return parsed;
}

describe("EventRoom next-dev bridge", () => {
	it("binds Next development to the separately registered EventRoom owner", async () => {
		// Given: Next development needs a real external Durable Object binding.
		const config = await readJsonConfig("wrangler.next-dev.jsonc");

		// When: the development config is loaded.
		const durableObjects = config["durable_objects"];
		if (!isRecord(durableObjects)) throw new Error("wrangler.next-dev.jsonc must declare durable_objects");
		const binding = recordArray(durableObjects["bindings"], "durable_objects.bindings")
			.find((candidate) => candidate["name"] === "EVENT_ROOM");

		// Then: EVENT_ROOM resolves to the local owner Worker instead of an internal stub.
		expect(binding).toEqual({
			name: "EVENT_ROOM",
			class_name: "EventRoom",
			script_name: ownerWorkerName,
		});
	});

	it("gives the EventRoom owner the same local D1 binding as Next development", async () => {
		// Given: the owner Worker must write the same local D1 database as Next development.
		const [productionConfig, nextConfig, ownerConfig] = await Promise.all([
			readJsonConfig("wrangler.jsonc"),
			readJsonConfig("wrangler.next-dev.jsonc"),
			readJsonConfig("wrangler.event-room-dev.jsonc"),
		]);

		// When: both development configs are read.
		const nextD1 = recordArray(nextConfig["d1_databases"], "next d1_databases");
		const ownerD1 = recordArray(ownerConfig["d1_databases"], "owner d1_databases");

		// Then: development declares the same D1 binding and database name as production.
		expect(ownerConfig["name"]).toBe(ownerWorkerName);
		expect(nextD1).toEqual(recordArray(productionConfig["d1_databases"], "production d1_databases"));
		expect(ownerD1).toEqual(nextD1);
	});

	it("mirrors production storage, image, and variable bindings without an assets worker", async () => {
		// Given: Next development reads platform bindings through the proxy config.
		const [productionConfig, nextConfig] = await Promise.all([
			readJsonConfig("wrangler.jsonc"),
			readJsonConfig("wrangler.next-dev.jsonc"),
		]);

		// When: the development bindings are compared with production.
		const productionR2 = recordArray(productionConfig["r2_buckets"], "production r2_buckets");
		const productionKv = recordArray(productionConfig["kv_namespaces"], "production kv_namespaces");

		// Then: every binding Next consumes is mirrored, while the proxy remains assets-free.
		expect(recordArray(nextConfig["r2_buckets"], "next r2_buckets")).toEqual(productionR2);
		expect(recordArray(nextConfig["kv_namespaces"], "next kv_namespaces")).toEqual(productionKv);
		expect(nextConfig["images"]).toEqual(productionConfig["images"]);
		expect(nextConfig["vars"]).toEqual(productionConfig["vars"]);
		expect(nextConfig["assets"]).toBeUndefined();
		expect(nextConfig["main"]).toBeUndefined();
	});

	it("starts the EventRoom owner before forwarding port arguments to Next", async () => {
		// Given: a developer runs the documented npm command with a custom Next port.
		const moduleUrl = pathToFileURL(path.join(projectRoot, "scripts/dev.mjs")).href;
		const devModule = await import(moduleUrl);
		const buildDevPlan = devModule["buildDevPlan"];
		if (typeof buildDevPlan !== "function") throw new Error("scripts/dev.mjs must export buildDevPlan");

		// When: the wrapper builds its child-process plan.
		const plan = buildDevPlan({
			rootDir: projectRoot,
			nextArgs: ["-p", "3108"],
			ownerPort: 8798,
			inspectorPort: 9238,
		});

		// Then: the owner receives the shared base root and Next receives the original arguments.
		expect(plan.owner.args).toContain("--persist-to");
		expect(plan.owner.args).toEqual(expect.arrayContaining(["--ip", "127.0.0.1"]));
		expect(plan.owner.args).toContain(path.join(projectRoot, ".wrangler/state"));
		expect(plan.next.args.slice(-3)).toEqual(["dev", "-p", "3108"]);
	});
});
