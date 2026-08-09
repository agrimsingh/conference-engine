"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { buttonClasses, INPUT_CLASSES } from "@/components/ui";

export function ProfileEditor({ eventId, displayName, bio }: { eventId: string; displayName: string; bio: string }) {
	const router = useRouter();
	const [name, setName] = useState(displayName);
	const [value, setValue] = useState(bio);
	const [open, setOpen] = useState(false);
	const [pending, setPending] = useState(false);
	const [error, setError] = useState<string | null>(null);
	async function save() {
		setPending(true); setError(null);
		try {
			const response = await fetch(`/api/portal/profile/${eventId}`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ displayName: name, bio: value }) });
			const data = await response.json() as { ok?: boolean; error?: string };
			if (!response.ok || !data.ok) setError(data.error ?? "Profile update failed");
			else { setOpen(false); router.refresh(); }
		} catch { setError("Network error"); } finally { setPending(false); }
	}
	if (!open) return <button type="button" onClick={() => setOpen(true)} className={buttonClasses("secondary", "sm")}>Edit event profile</button>;
	return <div className="mt-3 space-y-2 rounded-md border border-neutral-800 bg-neutral-950/60 p-3"><label className="block text-xs text-neutral-400">Display name<input value={name} onChange={(event) => setName(event.target.value)} className={`mt-1 w-full ${INPUT_CLASSES}`} /></label><label className="block text-xs text-neutral-400">Bio<textarea rows={5} value={value} onChange={(event) => setValue(event.target.value)} className={`mt-1 w-full ${INPUT_CLASSES}`} /></label>{error ? <p className="text-xs text-red-300">{error}</p> : null}<div className="flex gap-2"><button type="button" disabled={pending || !name.trim()} onClick={() => void save()} className={buttonClasses("primary", "sm")}>{pending ? "Saving…" : "Save profile"}</button><button type="button" disabled={pending} onClick={() => setOpen(false)} className={buttonClasses("secondary", "sm")}>Cancel</button></div></div>;
}
