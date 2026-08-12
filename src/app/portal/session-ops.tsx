"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { buttonClasses, noticeClasses } from "@/components/ui";

type Props = {
	submissionId: string;
	needsSlotAck: boolean;
	canHandoff: boolean;
	handoffLabel: string | null;
};

export function SessionOps({ submissionId, needsSlotAck, canHandoff, handoffLabel }: Props) {
	const router = useRouter();
	const [pending, setPending] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [email, setEmail] = useState("");
	const [name, setName] = useState("");

	async function ack() {
		setPending(true);
		setError(null);
		try {
			const response = await fetch(`/api/portal/submissions/${submissionId}/ack`, { method: "POST" });
			const data = (await response.json()) as { ok?: boolean; error?: string };
			if (!response.ok || !data.ok) {
				setError(data.error ?? "Could not confirm the time");
				return;
			}
			router.refresh();
		} catch {
			setError("Network error");
		} finally {
			setPending(false);
		}
	}

	async function handoff(event: FormEvent) {
		event.preventDefault();
		setPending(true);
		setError(null);
		try {
			const response = await fetch(`/api/portal/submissions/${submissionId}/handoff`, {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ email, name }),
			});
			const data = (await response.json()) as { ok?: boolean; error?: string };
			if (!response.ok || !data.ok) {
				setError(data.error ?? "Could not send the handoff");
				return;
			}
			setEmail("");
			setName("");
			router.refresh();
		} catch {
			setError("Network error");
		} finally {
			setPending(false);
		}
	}

	if (!needsSlotAck && !canHandoff && !handoffLabel) return null;

	return (
		<div className="mt-3 space-y-3 border-t border-neutral-800 pt-3">
			{needsSlotAck ? (
				<div>
					<p className="text-xs text-neutral-400">The scheduled time changed. Confirm you can still make it.</p>
					<button
						type="button"
						disabled={pending}
						onClick={() => void ack()}
						className={`${buttonClasses("primary", "sm")} mt-2`}
					>
						{pending ? "Saving…" : "Confirm this time"}
					</button>
				</div>
			) : null}
			{handoffLabel ? <p className="text-xs text-neutral-500">{handoffLabel}</p> : null}
			{canHandoff ? (
				<form className="space-y-2" onSubmit={(event) => void handoff(event)}>
					<p className="text-xs font-medium uppercase tracking-wide text-neutral-500">
						Hand off to a manager
					</p>
					<p className="text-xs text-neutral-500">
						They can finish portal tasks for you. You stay listed as the speaker.
					</p>
					<input
						type="email"
						required
						value={email}
						onChange={(event) => setEmail(event.target.value)}
						placeholder="manager@example.com"
						className="w-full rounded-md border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-100"
					/>
					<input
						type="text"
						value={name}
						onChange={(event) => setName(event.target.value)}
						placeholder="Name (optional)"
						className="w-full rounded-md border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-100"
					/>
					<button type="submit" disabled={pending} className={buttonClasses("secondary", "sm")}>
						{pending ? "Sending…" : "Send handoff"}
					</button>
				</form>
			) : null}
			{error ? <p className={noticeClasses("negative")}>{error}</p> : null}
		</div>
	);
}
