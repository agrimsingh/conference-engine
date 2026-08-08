"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { EmptyState, noticeClasses, StatusPill } from "@/components/ui";
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
	const mounted = useSyncExternalStore(
		() => () => {},
		() => true,
		() => false,
	);

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
				<p className="text-neutral-400">
					{snapshot.incompleteCount} outstanding task
					{snapshot.incompleteCount === 1 ? "" : "s"} across {snapshot.groups.length}{" "}
					speaker
					{snapshot.groups.length === 1 ? "" : "s"}
					{snapshot.pendingCoSpeakers.length > 0
						? ` · ${snapshot.pendingCoSpeakers.length} co-speaker${
								snapshot.pendingCoSpeakers.length === 1 ? "" : "s"
							} unconfirmed`
						: ""}
				</p>
				<div className="flex items-center gap-2">
					<span
						title={
							transport === "broadcasted"
								? "Live updates connected"
								: "Refreshing every few seconds"
						}
					>
						<StatusPill tone={transport === "broadcasted" ? "positive" : "warning"}>
							{transport === "broadcasted" ? "Live" : "Auto-refresh"}
						</StatusPill>
					</span>
					<span className="text-xs tabular-nums text-neutral-500">
						{mounted ? `updated ${new Date(snapshot.fetchedAt).toLocaleTimeString()}` : "updated just now"}
					</span>
				</div>
			</div>

			{lastError ? (
				<p className={noticeClasses("warning")}>
					Couldn&apos;t refresh live data: {lastError}
				</p>
			) : null}

			{snapshot.pendingCoSpeakers.length > 0 ? (
				<div className="rounded-lg border border-neutral-800 bg-neutral-900 px-4 py-3">
					<div className="flex flex-wrap items-baseline justify-between gap-2">
						<p className="font-medium text-neutral-100">
							Co-speakers awaiting confirmation
						</p>
						<span className="text-xs text-neutral-500">
							{snapshot.pendingCoSpeakers.length} pending
						</span>
					</div>
					<ul className="mt-3 divide-y divide-neutral-800">
						{snapshot.pendingCoSpeakers.map((item) => (
							<li
								key={item.speakerId}
								className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm"
							>
								<span>
									<span className="font-medium text-neutral-200">
										{item.name || item.email}
									</span>
									<span className="text-neutral-500"> · {item.submissionTitle}</span>
									{item.addedAfterAcceptance ? (
										<span className="ml-2 rounded-full border border-amber-500/30 bg-amber-500/10 px-1.5 text-[10px] font-medium uppercase tracking-wide text-amber-400">
											added late
										</span>
									) : null}
								</span>
								<StatusPill tone="warning">
									{item.invitedAt ? "invite sent" : "not invited"}
								</StatusPill>
							</li>
						))}
					</ul>
				</div>
			) : null}

			{snapshot.groups.length === 0 ? (
				<EmptyState
					title="All caught up"
					description="No outstanding speaker tasks. Accept a talk or wait for speakers to finish their checklist."
				/>
			) : (
				<ul className="space-y-4">
					{snapshot.groups.map((group) => (
						<li
							key={group.key}
							className="rounded-lg border border-neutral-800 bg-neutral-900 px-4 py-3"
						>
							<div className="flex flex-wrap items-baseline justify-between gap-2">
								<p className="font-medium text-neutral-100">
									{group.submissionTitle} ·{" "}
									{group.personName ?? group.personEmail}
								</p>
								<span className="text-xs text-neutral-500">
									{group.tasks.length} pending
								</span>
							</div>
							<p className="mt-1 text-xs text-neutral-500">{group.personEmail}</p>
							<ul className="mt-3 divide-y divide-neutral-800">
								{group.tasks.map((task) => (
									<li
										key={task.id}
										className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm"
									>
										<span className="font-medium text-neutral-200">
											{task.templateKey}
										</span>
										<StatusPill tone="warning">{task.status}</StatusPill>
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
