"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, noticeClasses } from "@/components/ui";
import { respondToCoSpeakerInvite } from "./actions";

type Props = {
	token: string;
	defaultIntent: "confirm" | "decline";
};

export function RespondButtons({ token, defaultIntent }: Props) {
	const router = useRouter();
	const [pending, setPending] = useState(false);
	const [error, setError] = useState<string | null>(null);

	async function respond(response: "confirm" | "decline") {
		setPending(true);
		setError(null);
		try {
			const result = await respondToCoSpeakerInvite(token, response);
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
					variant={defaultIntent === "confirm" ? "primary" : "secondary"}
					disabled={pending}
					onClick={() => void respond("confirm")}
				>
					Confirm participation
				</Button>
				<Button
					variant="secondary"
					disabled={pending}
					onClick={() => void respond("decline")}
				>
					Decline
				</Button>
			</div>
			{error ? <p className={noticeClasses("negative")}>{error}</p> : null}
		</div>
	);
}
