import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
	// The repo is nested under a shared workspace on some machines. Pinning the
	// root keeps Next from walking upward and warning about the wrong lockfile.
	turbopack: { root: process.cwd() },
};

export default nextConfig;

// Enable calling `getCloudflareContext()` in `next dev`.
// See https://opennext.js.org/cloudflare/bindings#local-access-to-bindings.
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";
if (process.env.NODE_ENV === "development") {
	const persistenceRoot = path.resolve(process.env.CE_WRANGLER_PERSIST_ROOT ?? path.join(process.cwd(), ".wrangler/state"));
	initOpenNextCloudflareForDev({
		configPath: path.join(process.cwd(), "wrangler.next-dev.jsonc"),
		persist: { path: path.join(persistenceRoot, "v3") },
		remoteBindings: false,
	});
}
