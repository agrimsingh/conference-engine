import { getBuildProvenance } from "@/lib/release/build-provenance";

// This response is rendered into the OpenNext artifact at build time, so it
// cannot be changed by a later Worker environment edit.
export const dynamic = "force-static";

const build = getBuildProvenance({
	buildSha: process.env.NEXT_PUBLIC_BUILD_SHA,
	nodeEnv: process.env.NODE_ENV,
});

export function GET(): Response {
	return Response.json(
		{ build },
		{ headers: { "cache-control": "no-store" } },
	);
}
