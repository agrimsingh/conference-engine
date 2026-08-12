const IDENTITY_KEY = /(author|speaker|presenter|participant|submitter|co.?author|name|email|company|organization|organisation|affiliation|employer|contact|bio|headshot|profile)/i;

/** Removes identity-bearing answer fields before reviewer props are serialized. */
export function suppressBlindIdentity(answers: Record<string, unknown>): Record<string, unknown> {
	return Object.fromEntries(Object.entries(answers).filter(([key]) => !IDENTITY_KEY.test(key)));
}

export function reviewerIdentityFields<T extends { submitterName: string | null; submitterEmail: string | null; answers: Record<string, unknown> }>(row: T, blind: boolean): T {
	const withoutEmail = { ...row, submitterEmail: null };
	if (!blind) return withoutEmail;
	return { ...withoutEmail, submitterName: null, answers: suppressBlindIdentity(row.answers) };
}
