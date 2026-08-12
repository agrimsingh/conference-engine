"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, noticeClasses } from "@/components/ui";
import { respondToSpeakerHandoff } from "./actions";

type Props = {
	token: string;
	defaultIntent: "accept" | "decline";
};

export function HandoffRespondButtons({ token, defaultIntent }: Props) {
	const router = useRouter();
	const [pending, setPending] = useState(false);
	const [error, setError] = useState<string | null>(null);

	async function respond(response: "accept" | "decline") {
		setPending(true);
		setError(null);
		try {
			const result = await respondToSpeakerHandoff(token, response);
			if (!result.ok) {
				setError(result.error);
				return;
			}
			router.refresh();
		} catch {
			setError("Something went wrong. Try the link again.");
		} finally {
			setPending(false);
		}
	}

	return (
		<div className="space-y-3">
			<div className="flex flex-wrap gap-2">
				<Button
					variant={defaultIntent === "accept" ? "primary" : "secondary"}
					disabled={pending}
					onClick={() => void respond("accept")}
				>
					Accept handoff
				</Button>
				<Button variant="secondary" disabled={pending} onClick={() => void respond("decline")}>
					Decline
				</Button>
			</div>
			{error ? <p className={noticeClasses("negative")}>{error}</p> : null}
		</div>
	);
}
