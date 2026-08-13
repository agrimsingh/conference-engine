"use client";

import { useState } from "react";
import { buttonClasses, noticeClasses } from "@/components/ui";

type Props = {
	readonly submissionId: string;
};

export function EditProposalButton({ submissionId }: Props) {
	const [pending, setPending] = useState(false);
	const [error, setError] = useState<string | null>(null);

	async function recoverEditAccess(): Promise<void> {
		setPending(true);
		setError(null);
		try {
			const response = await fetch(`/api/portal/submissions/${submissionId}/edit-link`, {
				method: "POST",
			});
			const raw: unknown = await response.json();
			const body = typeof raw === "object" && raw !== null ? raw : {};
			const ok = "ok" in body && body.ok === true;
			const editUrl = "editUrl" in body && typeof body.editUrl === "string"
				? body.editUrl
				: null;
			if (!response.ok || !ok || !editUrl) {
				setError("error" in body && typeof body.error === "string"
					? body.error
					: "Proposal edit access is unavailable");
				return;
			}
			window.location.assign(editUrl);
		} catch {
			setError("Couldn’t open the proposal. Try again.");
		} finally {
			setPending(false);
		}
	}

	return (
		<div>
			<button
				type="button"
				disabled={pending}
				onClick={() => void recoverEditAccess()}
				className={buttonClasses("secondary", "sm")}
			>
				{pending ? "Opening proposal…" : "Edit proposal"}
			</button>
			{error ? <p className={`mt-2 ${noticeClasses("negative")}`}>{error}</p> : null}
		</div>
	);
}
