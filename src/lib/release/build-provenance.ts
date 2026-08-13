export type BuildProvenance =
	| { readonly source: "git"; readonly revision: string }
	| { readonly source: "development" | "unknown"; readonly revision: null };

type BuildProvenanceInput = {
	readonly buildSha: string | undefined;
	readonly nodeEnv: string | undefined;
};

const EXACT_GIT_SHA = /^[0-9a-f]{40}$/i;

export function getBuildProvenance({ buildSha, nodeEnv }: BuildProvenanceInput): BuildProvenance {
	if (nodeEnv === "development") return { source: "development", revision: null };
	if (buildSha && EXACT_GIT_SHA.test(buildSha)) return { source: "git", revision: buildSha };
	return { source: "unknown", revision: null };
}
