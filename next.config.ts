import type { NextConfig } from "next";

const nextConfig: NextConfig = {
	// The repo is nested under a shared workspace on some machines. Pinning the
	// root keeps Next from walking upward and warning about the wrong lockfile.
	turbopack: { root: process.cwd() },
};

export default nextConfig;

// Enable calling `getCloudflareContext()` in `next dev`.
// See https://opennext.js.org/cloudflare/bindings#local-access-to-bindings.
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";
initOpenNextCloudflareForDev();
