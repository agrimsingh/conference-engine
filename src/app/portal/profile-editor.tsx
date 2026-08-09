"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { buttonClasses, INPUT_CLASSES } from "@/components/ui";
import type { SpeakerSocialLinks } from "@/lib/speakers/social";

type Props = {
	eventId: string;
	displayName: string;
	bio: string;
	jobTitle: string;
	company: string;
	social: SpeakerSocialLinks;
};

export function ProfileEditor({ eventId, displayName, bio, jobTitle, company, social }: Props) {
	const router = useRouter();
	const [name, setName] = useState(displayName);
	const [value, setValue] = useState(bio);
	const [title, setTitle] = useState(jobTitle);
	const [org, setOrg] = useState(company);
	const [twitter, setTwitter] = useState(social.twitter ?? "");
	const [linkedin, setLinkedin] = useState(social.linkedin ?? "");
	const [github, setGithub] = useState(social.github ?? "");
	const [website, setWebsite] = useState(social.website ?? "");
	const [open, setOpen] = useState(false);
	const [pending, setPending] = useState(false);
	const [error, setError] = useState<string | null>(null);
	async function save() {
		setPending(true); setError(null);
		try {
			const response = await fetch(`/api/portal/profile/${eventId}`, {
				method: "PUT",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({
					displayName: name,
					bio: value,
					jobTitle: title,
					company: org,
					social: { twitter, linkedin, github, website },
				}),
			});
			const data = await response.json() as { ok?: boolean; error?: string };
			if (!response.ok || !data.ok) setError(data.error ?? "Profile update failed");
			else { setOpen(false); router.refresh(); }
		} catch { setError("Network error"); } finally { setPending(false); }
	}
	if (!open) return <button type="button" onClick={() => setOpen(true)} className={buttonClasses("secondary", "sm")}>Edit event profile</button>;
	return (
		<div className="mt-3 space-y-2 rounded-md border border-neutral-800 bg-neutral-950/60 p-3">
			<label className="block text-xs text-neutral-400">Display name<input value={name} onChange={(event) => setName(event.target.value)} className={`mt-1 w-full ${INPUT_CLASSES}`} /></label>
			<label className="block text-xs text-neutral-400">Job title<input value={title} onChange={(event) => setTitle(event.target.value)} className={`mt-1 w-full ${INPUT_CLASSES}`} /></label>
			<label className="block text-xs text-neutral-400">Company<input value={org} onChange={(event) => setOrg(event.target.value)} className={`mt-1 w-full ${INPUT_CLASSES}`} /></label>
			<label className="block text-xs text-neutral-400">Bio<textarea rows={5} value={value} onChange={(event) => setValue(event.target.value)} className={`mt-1 w-full ${INPUT_CLASSES}`} /></label>
			<div className="grid gap-2 sm:grid-cols-2">
				<label className="block text-xs text-neutral-400">Twitter / X<input value={twitter} onChange={(event) => setTwitter(event.target.value)} className={`mt-1 w-full ${INPUT_CLASSES}`} /></label>
				<label className="block text-xs text-neutral-400">LinkedIn<input value={linkedin} onChange={(event) => setLinkedin(event.target.value)} className={`mt-1 w-full ${INPUT_CLASSES}`} /></label>
				<label className="block text-xs text-neutral-400">GitHub<input value={github} onChange={(event) => setGithub(event.target.value)} className={`mt-1 w-full ${INPUT_CLASSES}`} /></label>
				<label className="block text-xs text-neutral-400">Website<input value={website} onChange={(event) => setWebsite(event.target.value)} className={`mt-1 w-full ${INPUT_CLASSES}`} /></label>
			</div>
			{error ? <p className="text-xs text-red-300">{error}</p> : null}
			<div className="flex gap-2">
				<button type="button" disabled={pending || !name.trim()} onClick={() => void save()} className={buttonClasses("primary", "sm")}>{pending ? "Saving…" : "Save profile"}</button>
				<button type="button" disabled={pending} onClick={() => setOpen(false)} className={buttonClasses("secondary", "sm")}>Cancel</button>
			</div>
		</div>
	);
}
