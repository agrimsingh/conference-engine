import { describe, expect, it } from "vitest";
import { getBuildProvenance } from "./build-provenance";

describe("getBuildProvenance", () => {
	const revision = "0123456789abcdef0123456789abcdef01234567";

	it("reports an exact git revision when a 40-character SHA is baked into a production build", () => {
		// Given: a production build supplied with the exact commit SHA.
		const environment = { buildSha: revision, nodeEnv: "production" };

		// When: the public provenance is derived for the build artifact.
		const provenance = getBuildProvenance(environment);

		// Then: the route can identify the immutable source revision without exposing configuration.
		expect(provenance).toEqual({ source: "git", revision });
	});

	it("reports development even if a shell happens to provide a revision", () => {
		// Given: next dev inherits a revision-like environment variable.
		const environment = { buildSha: revision, nodeEnv: "development" };

		// When: the public provenance is derived.
		const provenance = getBuildProvenance(environment);

		// Then: it does not pretend the live development server is a release artifact.
		expect(provenance).toEqual({ source: "development", revision: null });
	});

	it("reports unknown when a production artifact has no exact revision", () => {
		// Given: a production build without a valid 40-character git SHA.
		const environment = { buildSha: "not-a-commit", nodeEnv: "production" };

		// When: the public provenance is derived.
		const provenance = getBuildProvenance(environment);

		// Then: it remains explicit about the missing provenance.
		expect(provenance).toEqual({ source: "unknown", revision: null });
	});
});
