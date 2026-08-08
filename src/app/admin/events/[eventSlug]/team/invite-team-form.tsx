"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { buttonClasses, INPUT_CLASSES, noticeClasses } from "@/components/ui";

type Member = {
	accountId: string;
	email: string;
	name: string;
	role: "owner" | "admin";
	createdAt: number;
};

type Props = {
	eventSlug: string;
	initialMembers: Member[];
	canRemove: boolean;
};

export function InviteTeamForm({
	eventSlug,
	initialMembers,
	canRemove,
}: Props) {
	const router = useRouter();
	const [members, setMembers] = useState(initialMembers);
	const [email, setEmail] = useState("");
	const [name, setName] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [notice, setNotice] = useState<string | null>(null);
	const [pending, setPending] = useState(false);
	const [devLoginUrl, setDevLoginUrl] = useState<string | null>(null);

	async function onInvite(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setPending(true);
		setError(null);
		setNotice(null);
		setDevLoginUrl(null);
		try {
			const response = await fetch(`/api/admin/events/${eventSlug}/members`, {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ email, name: name || undefined }),
			});
			const data = (await response.json()) as {
				ok?: boolean;
				error?: string;
				createdMembership?: boolean;
				emailStatus?: string;
				loginUrl?: string | null;
				member?: Member;
			};
			if (!response.ok || !data.ok || !data.member) {
				setError(data.error ?? "Invite failed");
				return;
			}

			setMembers((prev) => {
				const without = prev.filter(
					(row) => row.accountId !== data.member!.accountId,
				);
				return [
					...without,
					{
						accountId: data.member!.accountId,
						email: data.member!.email,
						name: data.member!.name,
						role: data.member!.role,
						createdAt: Date.now(),
					},
				].sort((a, b) => {
					if (a.role === b.role) return a.email.localeCompare(b.email);
					return a.role === "owner" ? -1 : 1;
				});
			});

			const resent = data.createdMembership
				? "Invited as organizer."
				: "Already a member — resent sign-in link.";
			const emailBit =
				data.emailStatus === "sent"
					? " Magic link emailed."
					: " Email failed to send — use the login URL if shown.";
			setNotice(`${resent}${emailBit}`);
			if (data.loginUrl) setDevLoginUrl(data.loginUrl);
			setEmail("");
			setName("");
			router.refresh();
		} catch {
			setError("Network error");
		} finally {
			setPending(false);
		}
	}

	async function onRemove(accountId: string) {
		setError(null);
		setNotice(null);
		try {
			const response = await fetch(`/api/admin/events/${eventSlug}/members`, {
				method: "DELETE",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ accountId }),
			});
			const data = (await response.json()) as { ok?: boolean; error?: string };
			if (!response.ok || !data.ok) {
				setError(data.error ?? "Could not remove member");
				return;
			}
			setMembers((prev) => prev.filter((row) => row.accountId !== accountId));
			setNotice("Removed organizer.");
			router.refresh();
		} catch {
			setError("Network error");
		}
	}

	return (
		<div className="space-y-8">
			<form onSubmit={onInvite} className="space-y-3 rounded-lg border border-neutral-800 bg-neutral-900/40 p-4">
				<p className="text-sm text-neutral-400">
					Invite by email. They get an <code className="text-neutral-300">admin</code>{" "}
					seat and a magic-link sign-in to this event.
				</p>
				<div className="grid gap-3 sm:grid-cols-2">
					<label className="block text-xs text-neutral-400">
						Email
						<input
							required
							type="email"
							value={email}
							onChange={(e) => setEmail(e.target.value)}
							className={`mt-1 ${INPUT_CLASSES}`}
							placeholder="teammate@example.com"
						/>
					</label>
					<label className="block text-xs text-neutral-400">
						Name (optional)
						<input
							type="text"
							value={name}
							onChange={(e) => setName(e.target.value)}
							className={`mt-1 ${INPUT_CLASSES}`}
							placeholder="Ada Lovelace"
						/>
					</label>
				</div>
				<button
					type="submit"
					disabled={pending}
					className={buttonClasses("primary")}
				>
					{pending ? "Sending…" : "Send invite"}
				</button>
			</form>

			{error ? <p className={noticeClasses("negative")}>{error}</p> : null}
			{notice ? <p className={noticeClasses("positive")}>{notice}</p> : null}
			{devLoginUrl ? (
				<p className="break-all text-xs text-neutral-500">
					Dev login URL:{" "}
					<a href={devLoginUrl} className="text-neutral-300 underline">
						{devLoginUrl}
					</a>
				</p>
			) : null}

			<ul className="divide-y divide-neutral-800 rounded-lg border border-neutral-800">
				{members.map((member) => (
					<li
						key={member.accountId}
						className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
					>
						<div>
							<p className="text-sm text-neutral-100">
								{member.name.trim() || member.email}
							</p>
							<p className="text-xs text-neutral-500">
								{member.email} · {member.role}
							</p>
						</div>
						{canRemove && member.role !== "owner" ? (
							<button
								type="button"
								onClick={() => void onRemove(member.accountId)}
								className={buttonClasses("secondary", "sm")}
							>
								Remove
							</button>
						) : null}
					</li>
				))}
				{members.length === 0 ? (
					<li className="px-4 py-6 text-sm text-neutral-500">No members yet.</li>
				) : null}
			</ul>
		</div>
	);
}
