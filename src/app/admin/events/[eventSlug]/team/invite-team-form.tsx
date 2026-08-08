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

type InviteRole = "admin" | "owner";

type Props = {
	eventSlug: string;
	initialMembers: Member[];
	canRemove: boolean;
	canTransfer: boolean;
	canInviteAsOwner: boolean;
	currentAccountId: string | null;
	currentRole: "owner" | "admin" | null;
};

function sortMembers(rows: Member[]): Member[] {
	return [...rows].sort((a, b) => {
		if (a.role === b.role) return a.email.localeCompare(b.email);
		return a.role === "owner" ? -1 : 1;
	});
}

export function InviteTeamForm({
	eventSlug,
	initialMembers,
	canRemove,
	canTransfer,
	canInviteAsOwner,
	currentAccountId,
	currentRole,
}: Props) {
	const router = useRouter();
	const [members, setMembers] = useState(initialMembers);
	const [email, setEmail] = useState("");
	const [name, setName] = useState("");
	const [role, setRole] = useState<InviteRole>("admin");
	const [error, setError] = useState<string | null>(null);
	const [notice, setNotice] = useState<string | null>(null);
	const [pending, setPending] = useState(false);
	const [devLoginUrl, setDevLoginUrl] = useState<string | null>(null);

	const canLeave = currentRole === "admin" && currentAccountId !== null;

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
				body: JSON.stringify({
					email,
					name: name || undefined,
					role: canInviteAsOwner ? role : "admin",
				}),
			});
			const data = (await response.json()) as {
				ok?: boolean;
				error?: string;
				emailStatus?: string;
				loginUrl?: string | null;
				pendingAcceptance?: boolean;
				role?: InviteRole;
				invitee?: { accountId: string; email: string; name: string };
			};
			if (!response.ok || !data.ok || !data.invitee) {
				setError(data.error ?? "Invite failed");
				return;
			}

			const roleLabel = data.role === "owner" ? "ownership-transfer" : "organizer";
			if (!data.pendingAcceptance) {
				setError(`The ${roleLabel} invite to ${data.invitee.email} was not activated because email delivery failed; no access or ownership changed.`);
				setEmail("");
				setName("");
				setRole("admin");
				return;
			}
			const resent = data.pendingAcceptance
				? `Sent a pending ${roleLabel} invite to ${data.invitee.email}. Access changes after the link is accepted.`
				: `The ${roleLabel} invite to ${data.invitee.email} was not activated; no access or ownership changed.`;
			const emailBit = data.emailStatus === "sent"
				? " Magic link emailed."
				: data.emailStatus === "uncertain"
					? " Email delivery is uncertain; the invitation link remains valid if it arrived."
					: " Email failed to send.";
			setNotice(`${resent}${emailBit}`);
			if (data.loginUrl) setDevLoginUrl(data.loginUrl);
			setEmail("");
			setName("");
			setRole("admin");
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

	async function onTransfer(accountId: string) {
		setError(null);
		setNotice(null);
		setPending(true);
		try {
			const response = await fetch(
				`/api/admin/events/${eventSlug}/members/transfer`,
				{
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({ accountId }),
				},
			);
			const data = (await response.json()) as { ok?: boolean; error?: string };
			if (!response.ok || !data.ok) {
				setError(data.error ?? "Could not transfer ownership");
				return;
			}
			setMembers((prev) =>
				sortMembers(
					prev.map((row) => {
						if (row.accountId === accountId) {
							return { ...row, role: "owner" as const };
						}
						if (row.role === "owner") {
							return { ...row, role: "admin" as const };
						}
						return row;
					}),
				),
			);
			setNotice("Ownership transferred.");
			router.refresh();
		} catch {
			setError("Network error");
		} finally {
			setPending(false);
		}
	}

	async function onLeave() {
		setError(null);
		setNotice(null);
		setPending(true);
		try {
			const response = await fetch(
				`/api/admin/events/${eventSlug}/members/leave`,
				{ method: "POST" },
			);
			const data = (await response.json()) as { ok?: boolean; error?: string };
			if (!response.ok || !data.ok) {
				setError(data.error ?? "Could not leave team");
				return;
			}
			router.push("/admin");
			router.refresh();
		} catch {
			setError("Network error");
		} finally {
			setPending(false);
		}
	}

	return (
		<div className="space-y-8">
			<form onSubmit={onInvite} className="space-y-3 rounded-lg border border-neutral-800 bg-neutral-900/40 p-4">
				<p className="text-sm text-neutral-400">
					Invite by email. Default role is{" "}
					<code className="text-neutral-300">admin</code>. Inviting as{" "}
					<code className="text-neutral-300">owner</code> transfers ownership only after the recipient accepts the email link.
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
					{canInviteAsOwner ? (
						<label className="block text-xs text-neutral-400 sm:col-span-2">
							Role
							<select
								value={role}
								onChange={(e) => setRole(e.target.value as InviteRole)}
								className={`mt-1 ${INPUT_CLASSES}`}
							>
								<option value="admin">admin</option>
								<option value="owner">owner (transfers ownership)</option>
							</select>
						</label>
					) : null}
				</div>
				<button
					type="submit"
					disabled={pending}
					className={buttonClasses("primary")}
				>
					{pending ? "Sending…" : "Send invite"}
				</button>
			</form>

			{canLeave ? (
				<div className="rounded-lg border border-neutral-800 bg-neutral-900/40 p-4">
					<p className="mb-3 text-sm text-neutral-400">
						You are an admin on this event. Leaving removes your access.
					</p>
					<button
						type="button"
						disabled={pending}
						onClick={() => void onLeave()}
						className={buttonClasses("secondary")}
					>
						Leave team
					</button>
				</div>
			) : null}

			{currentRole === "owner" ? (
				<p className="text-xs text-neutral-500">
					As owner you must transfer ownership before you can leave.
				</p>
			) : null}

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
				{members.map((member) => {
					const isSelf = member.accountId === currentAccountId;
					return (
						<li
							key={member.accountId}
							className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
						>
							<div>
								<p className="text-sm text-neutral-100">
									{member.name.trim() || member.email}
									{isSelf ? (
										<span className="ml-2 text-xs text-neutral-500">(you)</span>
									) : null}
								</p>
								<p className="text-xs text-neutral-500">
									{member.email} · {member.role}
								</p>
							</div>
							<div className="flex flex-wrap items-center gap-2">
								{canTransfer && member.role === "admin" ? (
									<button
										type="button"
										disabled={pending}
										onClick={() => void onTransfer(member.accountId)}
										className={buttonClasses("secondary", "sm")}
									>
										Transfer ownership
									</button>
								) : null}
								{canRemove && member.role !== "owner" ? (
									<button
										type="button"
										disabled={pending}
										onClick={() => void onRemove(member.accountId)}
										className={buttonClasses("secondary", "sm")}
									>
										Remove
									</button>
								) : null}
							</div>
						</li>
					);
				})}
				{members.length === 0 ? (
					<li className="px-4 py-6 text-sm text-neutral-500">No members yet.</li>
				) : null}
			</ul>
		</div>
	);
}
