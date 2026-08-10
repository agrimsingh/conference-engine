"use client";

import { useEffect, useState } from "react";
import { buttonClasses, INPUT_CLASSES, noticeClasses } from "@/components/ui";

type ApiToken = {
	id: string;
	name: string;
	prefix: string;
	createdAt: number;
	lastUsedAt: number | null;
};

type Props = {
	eventSlug: string;
};

function formatWhen(value: number | null): string {
	if (value == null) return "never";
	return new Date(value).toLocaleString();
}

export function ApiTokensPanel({ eventSlug }: Props) {
	const [tokens, setTokens] = useState<ApiToken[]>([]);
	const [name, setName] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [notice, setNotice] = useState<string | null>(null);
	const [plaintext, setPlaintext] = useState<string | null>(null);
	const [pending, setPending] = useState(false);
	const [loading, setLoading] = useState(true);

	async function refresh() {
		const response = await fetch(`/api/admin/events/${eventSlug}/tokens`);
		const data = (await response.json()) as {
			ok?: boolean;
			error?: string;
			tokens?: ApiToken[];
		};
		if (!response.ok || !data.ok || !data.tokens) {
			throw new Error(data.error || "Could not load tokens");
		}
		setTokens(data.tokens);
	}

	useEffect(() => {
		let cancelled = false;
		void (async () => {
			try {
				await refresh();
			} catch (err) {
				if (!cancelled) {
					setError(err instanceof Error ? err.message : "Could not load tokens");
				}
			} finally {
				if (!cancelled) setLoading(false);
			}
		})();
		return () => {
			cancelled = true;
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps -- load once per event
	}, [eventSlug]);

	async function onCreate(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setPending(true);
		setError(null);
		setNotice(null);
		setPlaintext(null);
		try {
			const response = await fetch(`/api/admin/events/${eventSlug}/tokens`, {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ name }),
			});
			const data = (await response.json()) as {
				ok?: boolean;
				error?: string;
				token?: { token: string; name: string };
			};
			if (!response.ok || !data.ok || !data.token) {
				throw new Error(data.error || "Could not create token");
			}
			setPlaintext(data.token.token);
			setNotice("Copy this token now. It will not be shown again.");
			setName("");
			await refresh();
		} catch (err) {
			setError(err instanceof Error ? err.message : "Could not create token");
		} finally {
			setPending(false);
		}
	}

	async function onRevoke(tokenId: string) {
		setPending(true);
		setError(null);
		setNotice(null);
		try {
			const response = await fetch(
				`/api/admin/events/${eventSlug}/tokens/${tokenId}`,
				{ method: "DELETE" },
			);
			const data = (await response.json()) as { ok?: boolean; error?: string };
			if (!response.ok || !data.ok) {
				throw new Error(data.error || "Could not revoke token");
			}
			setNotice("Token revoked.");
			if (plaintext) setPlaintext(null);
			await refresh();
		} catch (err) {
			setError(err instanceof Error ? err.message : "Could not revoke token");
		} finally {
			setPending(false);
		}
	}

	async function copyPlaintext() {
		if (!plaintext) return;
		try {
			await navigator.clipboard.writeText(plaintext);
			setNotice("Token copied to clipboard.");
		} catch {
			setNotice("Select and copy the token manually.");
		}
	}

	return (
		<div className="space-y-6">
			{error ? <p className={noticeClasses("negative")}>{error}</p> : null}
			{notice ? <p className={noticeClasses("positive")}>{notice}</p> : null}
			{plaintext ? (
				<div className="space-y-2 rounded border border-amber-900/60 bg-amber-950/30 p-3">
					<p className="text-xs text-amber-200/90">
						Plaintext token (shown once)
					</p>
					<code className="block break-all text-sm text-amber-100">{plaintext}</code>
					<button
						type="button"
						onClick={() => void copyPlaintext()}
						className={buttonClasses("secondary")}
					>
						Copy token
					</button>
				</div>
			) : null}

			<form onSubmit={onCreate} className="flex flex-wrap items-end gap-3">
				<label className="block min-w-[14rem] flex-1 text-sm text-neutral-300">
					Token name
					<input
						required
						type="text"
						value={name}
						onChange={(e) => setName(e.target.value)}
						className={`mt-1 w-full ${INPUT_CLASSES}`}
						placeholder="CI agent"
					/>
				</label>
				<button type="submit" disabled={pending} className={buttonClasses("primary")}>
					{pending ? "Creating…" : "Create token"}
				</button>
			</form>

			<div>
				<p className="mb-3 text-sm font-medium text-neutral-200">Active tokens</p>
				{loading ? (
					<p className="text-sm text-neutral-500">Loading…</p>
				) : (
					<ul className="divide-y divide-neutral-800 border-t border-neutral-800">
						{tokens.map((token) => (
							<li
								key={token.id}
								className="flex flex-wrap items-center justify-between gap-3 py-3"
							>
								<div>
									<p className="text-sm text-neutral-100">{token.name}</p>
									<p className="text-xs text-neutral-500">
										{token.prefix}… · created {formatWhen(token.createdAt)} · last
										used {formatWhen(token.lastUsedAt)}
									</p>
								</div>
								<button
									type="button"
									disabled={pending}
									onClick={() => void onRevoke(token.id)}
									className={buttonClasses("secondary")}
								>
									Revoke
								</button>
							</li>
						))}
						{tokens.length === 0 ? (
							<li className="py-6 text-sm text-neutral-500">No API tokens yet.</li>
						) : null}
					</ul>
				)}
			</div>
		</div>
	);
}
