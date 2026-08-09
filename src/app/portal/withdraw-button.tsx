"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { buttonClasses, noticeClasses } from "@/components/ui";

type Props = {
	submissionId: string;
};

export function WithdrawButton({ submissionId }: Props) {
	const router = useRouter();
	const [pending, setPending] = useState(false);
	const [error, setError] = useState<string | null>(null);

	async function withdraw() {
		if (!window.confirm("Withdraw this submission? Organizers will see it as withdrawn.")) {
			return;
		}
		setPending(true);
		setError(null);
		try {
			const response = await fetch(`/api/portal/submissions/${submissionId}/withdraw`, {
				method: "POST",
			});
			const data = (await response.json()) as { ok?: boolean; error?: string };
			if (!response.ok || !data.ok) {
				setError(data.error ?? "Withdraw failed");
				return;
			}
			router.refresh();
		} catch {
			setError("Network error");
		} finally {
			setPending(false);
		}
	}

	return (
		<div className="mt-3">
			<button
				type="button"
				disabled={pending}
				onClick={() => void withdraw()}
				className={`${buttonClasses("secondary", "sm")} text-red-400`}
			>
				{pending ? "Withdrawing…" : "Withdraw submission"}
			</button>
			{error ? <p className={`mt-2 ${noticeClasses("negative")}`}>{error}</p> : null}
		</div>
	);
}
