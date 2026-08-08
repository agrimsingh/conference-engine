"use client";

import { useEffect, useState } from "react";
import {
	parseInvalidateMessage,
	shouldRefetchOnInvalidate,
	type LiveSyncTransport,
	type OutstandingTasksSnapshot,
} from "@/lib/domain";

type Props = {
	eventSlug: string;
	initialSnapshot: OutstandingTasksSnapshot;
};

type SnapshotResponse = {
	ok: boolean;
	snapshot?: OutstandingTasksSnapshot;
	error?: string;
};

const POLL_MS = 2000;

export function OutstandingDashboard({ eventSlug, initialSnapshot }: Props) {
	const [snapshot, setSnapshot] = useState(initialSnapshot);
	const [transport, setTransport] = useState<LiveSyncTransport>("polling");
	const [lastError, setLastError] = useState<string | null>(null);

	useEffect(() => {
		let cancelled = false;
		let pollTimer: ReturnType<typeof setInterval> | null = null;
		let ws: WebSocket | null = null;
		let refetching = false;

		async function refetch(): Promise<void> {
			if (refetching) return;
			refetching = true;
			try {
				const response = await fetch(
					`/api/admin/events/${eventSlug}/tasks/outstanding`,
					{ cache: "no-store" },
				);
				const body = (await response.json()) as SnapshotResponse;
				if (!response.ok || !body.ok || !body.snapshot) {
					if (!cancelled) {
						setLastError(body.error ?? `HTTP ${response.status}`);
					}
					return;
				}
				if (!cancelled) {
					setSnapshot(body.snapshot);
					setLastError(null);
				}
			} catch (error) {
				if (!cancelled) {
					setLastError(error instanceof Error ? error.message : "Fetch failed");
				}
			} finally {
				refetching = false;
			}
		}

		function stopPolling(): void {
			if (pollTimer !== null) {
				clearInterval(pollTimer);
				pollTimer = null;
			}
		}

		function startPolling(): void {
			if (cancelled || pollTimer !== null) return;
			setTransport("polling");
			pollTimer = setInterval(() => {
				void refetch();
			}, POLL_MS);
		}

		function connectWs(): void {
			const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
			const url = `${protocol}//${window.location.host}/api/admin/events/${eventSlug}/room`;

			try {
				ws = new WebSocket(url);
			} catch {
				startPolling();
				return;
			}

			ws.addEventListener("open", () => {
				if (cancelled) return;
				stopPolling();
				setTransport("broadcasted");
				setLastError(null);
			});

			ws.addEventListener("message", (event) => {
				if (typeof event.data !== "string") return;
				if (event.data === "pong") return;
				const message = parseInvalidateMessage(event.data);
				if (!message) {
					void refetch();
					return;
				}
				if (shouldRefetchOnInvalidate(message.reason)) {
					void refetch();
				}
			});

			ws.addEventListener("close", () => {
				if (cancelled) return;
				startPolling();
			});

			ws.addEventListener("error", () => {
				ws?.close();
			});
		}

		void refetch();
		startPolling();
		connectWs();

		return () => {
			cancelled = true;
			stopPolling();
			if (ws) {
				ws.close();
				ws = null;
			}
		};
	}, [eventSlug]);

	return (
		<div className="space-y-4">
			<div className="flex flex-wrap items-center justify-between gap-3 text-sm">
				<p className="text-neutral-600">
					{snapshot.incompleteCount} outstanding task
					{snapshot.incompleteCount === 1 ? "" : "s"} across {snapshot.groups.length}{" "}
					speaker
					{snapshot.groups.length === 1 ? "" : "s"}
				</p>
				<div className="flex items-center gap-2">
					<span
						className={
							transport === "broadcasted"
								? "rounded bg-emerald-100 px-2 py-0.5 text-xs font-medium uppercase tracking-wide text-emerald-800"
								: "rounded bg-amber-100 px-2 py-0.5 text-xs font-medium uppercase tracking-wide text-amber-900"
						}
						title={
							transport === "broadcasted"
								? "EventRoom WebSocket invalidate path"
								: "2s poll fallback (typical under next dev without DO upgrade)"
						}
					>
						{transport}
					</span>
					<span className="text-xs text-neutral-500">
						updated {new Date(snapshot.fetchedAt).toLocaleTimeString()}
					</span>
				</div>
			</div>

			{lastError ? (
				<p className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
					Live sync issue: {lastError}
				</p>
			) : null}

			{snapshot.groups.length === 0 ? (
				<p className="text-sm text-neutral-600">
					No outstanding speaker tasks. Accept a submission or wait for speakers to
					finish uploads.
				</p>
			) : (
				<ul className="space-y-4">
					{snapshot.groups.map((group) => (
						<li
							key={group.key}
							className="rounded border border-neutral-200 bg-white px-4 py-3"
						>
							<div className="flex flex-wrap items-baseline justify-between gap-2">
								<p className="font-medium">
									{group.submissionTitle} ·{" "}
									{group.personName ?? group.personEmail}
								</p>
								<span className="text-xs text-neutral-500">
									{group.tasks.length} pending
								</span>
							</div>
							<p className="mt-1 text-xs text-neutral-500">{group.personEmail}</p>
							<ul className="mt-3 divide-y divide-neutral-100">
								{group.tasks.map((task) => (
									<li
										key={task.id}
										className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm"
									>
										<span className="font-medium">{task.templateKey}</span>
										<span className="rounded bg-neutral-100 px-2 py-0.5 text-xs uppercase tracking-wide">
											{task.status}
										</span>
									</li>
								))}
							</ul>
						</li>
					))}
				</ul>
			)}
		</div>
	);
}
