import { getCloudflareContext } from "@opennextjs/cloudflare";

export async function getCloudflareEnv(): Promise<CloudflareEnv> {
	const { env } = await getCloudflareContext({ async: true });
	return env;
}

export async function getDb(): Promise<D1Database> {
	const env = await getCloudflareEnv();
	if (!env.DB) {
		throw new Error("D1 binding DB is not configured");
	}
	return env.DB;
}

export async function getFilesBucket(): Promise<R2Bucket> {
	const env = await getCloudflareEnv();
	if (!env.FILES) {
		throw new Error("R2 binding FILES is not configured");
	}
	return env.FILES;
}

export async function getSessionsKv(): Promise<KVNamespace> {
	const env = await getCloudflareEnv();
	if (!env.SESSIONS) {
		throw new Error("KV binding SESSIONS is not configured");
	}
	return env.SESSIONS;
}

export async function getAuthSecret(): Promise<string> {
	const env = await getCloudflareEnv();
	const secret = env.AUTH_SECRET;
	if (!secret) {
		throw new Error("AUTH_SECRET is not configured");
	}
	return secret;
}
