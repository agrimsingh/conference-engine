"use client";

import { useRouter } from "next/navigation";
import Image from "next/image";
import { useState } from "react";
import { buttonClasses, INPUT_CLASSES } from "@/components/ui";
import type { SpeakerSocialLinks } from "@/lib/speakers/social";

type Props = {
	eventId: string;
	displayName: string;
	bio: string;
	jobTitle: string;
	company: string;
	salutation: string;
	pronouns: string;
	honorific: string;
	social: SpeakerSocialLinks;
	hasHeadshot: boolean;
	/** Profile tab shows the form open; legacy call sites keep a collapsed trigger. */
	variant?: "collapsed" | "panel";
};

export function ProfileEditor({
	eventId,
	displayName,
	bio,
	jobTitle,
	company,
	salutation,
	pronouns,
	honorific,
	social,
	hasHeadshot,
	variant = "collapsed",
}: Props) {
	const router = useRouter();
	const [name, setName] = useState(displayName);
	const [value, setValue] = useState(bio);
	const [title, setTitle] = useState(jobTitle);
	const [org, setOrg] = useState(company);
	const [salutationValue, setSalutationValue] = useState(salutation);
	const [pronounsValue, setPronounsValue] = useState(pronouns);
	const [honorificValue, setHonorificValue] = useState(honorific);
	const [twitter, setTwitter] = useState(social.twitter ?? "");
	const [linkedin, setLinkedin] = useState(social.linkedin ?? "");
	const [github, setGithub] = useState(social.github ?? "");
	const [website, setWebsite] = useState(social.website ?? "");
	const [facebook, setFacebook] = useState(social.facebook ?? "");
	const [open, setOpen] = useState(variant === "panel");
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
					salutation: salutationValue,
					pronouns: pronounsValue,
					honorific: honorificValue,
					social: { twitter, linkedin, github, website, facebook },
				}),
			});
			const data = await response.json() as { ok?: boolean; error?: string };
			if (!response.ok || !data.ok) setError(data.error ?? "Profile update failed");
			else {
				if (variant === "collapsed") setOpen(false);
				router.refresh();
			}
		} catch { setError("Network error"); } finally { setPending(false); }
	}
	async function upload(file: File) {
		setPending(true); setError(null); try { const form = new FormData(); form.set("file", file); const response = await fetch(`/api/portal/profile/${eventId}`, { method: "POST", body: form }); const data = await response.json() as { ok?: boolean; error?: string }; if (!response.ok || !data.ok) setError(data.error ?? "Headshot upload failed"); else router.refresh(); } catch { setError("Network error"); } finally { setPending(false); }
	}
	if (!open) return <div className="flex items-center gap-3">{hasHeadshot ? <Image unoptimized width={56} height={56} src={`/api/portal/profile/${eventId}/headshot`} alt={`${displayName} headshot`} className="h-14 w-14 rounded-full object-cover" /> : null}<button type="button" onClick={() => setOpen(true)} className={buttonClasses("secondary", "sm")}>Edit event profile</button></div>;
	return (
		<div className={`space-y-2 rounded-md border border-neutral-800 bg-neutral-950/60 p-3 ${variant === "collapsed" ? "mt-3" : ""}`}>
			<label className="block text-xs text-neutral-400">Display name<input value={name} onChange={(event) => setName(event.target.value)} className={`mt-1 w-full ${INPUT_CLASSES}`} /></label>
			<div className="grid gap-2 sm:grid-cols-3">
				<label className="block text-xs text-neutral-400">Salutation<input value={salutationValue} onChange={(event) => setSalutationValue(event.target.value)} placeholder="Dr / Mx / …" className={`mt-1 w-full ${INPUT_CLASSES}`} /></label>
				<label className="block text-xs text-neutral-400">Pronouns<input value={pronounsValue} onChange={(event) => setPronounsValue(event.target.value)} placeholder="they/them" className={`mt-1 w-full ${INPUT_CLASSES}`} /></label>
				<label className="block text-xs text-neutral-400">Honorific<input value={honorificValue} onChange={(event) => setHonorificValue(event.target.value)} placeholder="PhD / OBE / …" className={`mt-1 w-full ${INPUT_CLASSES}`} /></label>
			</div>
			<label className="block text-xs text-neutral-400">Job title<input value={title} onChange={(event) => setTitle(event.target.value)} className={`mt-1 w-full ${INPUT_CLASSES}`} /></label>
			<label className="block text-xs text-neutral-400">Company<input value={org} onChange={(event) => setOrg(event.target.value)} className={`mt-1 w-full ${INPUT_CLASSES}`} /></label>
			<label className="block text-xs text-neutral-400">Bio<textarea rows={5} value={value} onChange={(event) => setValue(event.target.value)} className={`mt-1 w-full ${INPUT_CLASSES}`} /></label>
			<div className="grid gap-2 sm:grid-cols-2">
				<label className="block text-xs text-neutral-400">X (Twitter)<input value={twitter} onChange={(event) => setTwitter(event.target.value)} className={`mt-1 w-full ${INPUT_CLASSES}`} /></label>
				<label className="block text-xs text-neutral-400">LinkedIn<input value={linkedin} onChange={(event) => setLinkedin(event.target.value)} className={`mt-1 w-full ${INPUT_CLASSES}`} /></label>
				<label className="block text-xs text-neutral-400">GitHub<input value={github} onChange={(event) => setGithub(event.target.value)} className={`mt-1 w-full ${INPUT_CLASSES}`} /></label>
				<label className="block text-xs text-neutral-400">Facebook<input value={facebook} onChange={(event) => setFacebook(event.target.value)} className={`mt-1 w-full ${INPUT_CLASSES}`} /></label>
				<label className="block text-xs text-neutral-400 sm:col-span-2">Website<input value={website} onChange={(event) => setWebsite(event.target.value)} className={`mt-1 w-full ${INPUT_CLASSES}`} /></label>
			</div>
			<label className="block text-xs text-neutral-400">Headshot (PNG, JPEG, or WebP; max 5 MB)<input type="file" accept="image/png,image/jpeg,image/webp" disabled={pending} onChange={(event) => { const file = event.target.files?.[0]; if (file) void upload(file); }} className="mt-1 block w-full text-xs" /></label>
			{hasHeadshot ? <Image unoptimized width={96} height={96} src={`/api/portal/profile/${eventId}/headshot`} alt={`${displayName} headshot`} className="h-24 w-24 rounded-lg object-cover" /> : null}
			{error ? <p className="text-xs text-red-300">{error}</p> : null}
			<div className="flex gap-2">
				<button type="button" disabled={pending || !name.trim()} onClick={() => void save()} className={buttonClasses("primary", "sm")}>{pending ? "Saving…" : "Save profile"}</button>
				{variant === "collapsed" ? (
					<button type="button" disabled={pending} onClick={() => setOpen(false)} className={buttonClasses("secondary", "sm")}>Cancel</button>
				) : null}
			</div>
		</div>
	);
}
