/** Small, explicit token surface for organizer-authored CFP lifecycle copy. */
export function renderFormCopy(
	copy: string,
	context: { eventName: string; submitterName: string; title: string; resumeUrl?: string; portalUrl?: string },
): string {
	return copy
		.replaceAll("{{event_name}}", context.eventName)
		.replaceAll("{{submitter_name}}", context.submitterName)
		.replaceAll("{{title}}", context.title)
		.replaceAll("{{resume_url}}", context.resumeUrl ?? "");
}

/** Organizer copy can be freely written, but resume emails always retain a usable link. */
export function composeResumeDraftEmail(copy: string | null | undefined, context: Parameters<typeof renderFormCopy>[1]): string {
	const resumeUrl = context.resumeUrl ?? "";
	if (!copy?.trim()) return `Hey ${context.submitterName},\n\nUse this link to resume your saved proposal:\n${resumeUrl}\n\nIf you didn't request this, you can ignore this email.\n\nIf anything looks off, just reply to this email.`;
	return `${renderFormCopy(copy, context)}\n\nResume your draft: ${resumeUrl}`;
}

export function confirmationCopyOverride(copy: string | null | undefined, context: Parameters<typeof renderFormCopy>[1]): { subject: string; text: string } | undefined {
	if (!copy?.trim()) return undefined;
	const rendered = renderFormCopy(copy, context);
	const text = context.portalUrl && !rendered.includes(context.portalUrl)
		? `${rendered}\n\n${context.portalUrl}`
		: rendered;
	return { subject: `We received your proposal for ${context.eventName}`, text };
}
