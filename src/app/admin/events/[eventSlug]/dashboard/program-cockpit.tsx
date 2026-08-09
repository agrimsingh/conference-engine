"use client";

import Link from "next/link";
import { useEffect, useState, useSyncExternalStore } from "react";
import { Button, EmptyState, noticeClasses, StatusPill, buttonClasses } from "@/components/ui";
import {
	COCKPIT_SECTION_PREVIEW_COUNT,
	cockpitBlockerCounts,
	cockpitSectionCaption,
	cockpitSectionPreview,
	cockpitTotalBlockers,
	parseInvalidateMessage,
	shouldRefetchOnInvalidate,
	type CockpitSnapshot,
	type LiveSyncTransport,
} from "@/lib/domain";
import { bootstrapRoomTicket } from "@/lib/realtime/room-client";

type Props = {
	eventSlug: string;
	initialSnapshot: CockpitSnapshot;
};

type SnapshotResponse = {
	ok: boolean;
	snapshot?: CockpitSnapshot;
	error?: string;
};

const POLL_MS = 2000;

function useExpanded(): [boolean, () => void] {
	const [expanded, setExpanded] = useState(false);
	return [expanded, () => setExpanded((value) => !value)];
}

function ShowMoreToggle({
	itemCount,
	expanded,
	onToggle,
}: {
	itemCount: number;
	expanded: boolean;
	onToggle: () => void;
}) {
	if (itemCount <= COCKPIT_SECTION_PREVIEW_COUNT) return null;
	return (
		<button
			type="button"
			onClick={onToggle}
			className="mt-2 text-xs font-medium text-neutral-400 hover:text-neutral-200"
		>
			{expanded ? "Show fewer" : `Show all ${itemCount}`}
		</button>
	);
}

export function ProgramCockpit({ eventSlug, initialSnapshot }: Props) {
	const [snapshot, setSnapshot] = useState(initialSnapshot);
	const [transport, setTransport] = useState<LiveSyncTransport>("polling");
	const [lastError, setLastError] = useState<string | null>(null);
	const [actionError, setActionError] = useState<string | null>(null);
	const [pendingKey, setPendingKey] = useState<string | null>(null);
	const [assignReviewerId, setAssignReviewerId] = useState(
		initialSnapshot.reviewers[0]?.id ?? "",
	);
	const selectedReviewerId =
		assignReviewerId &&
		snapshot.reviewers.some((reviewer) => reviewer.id === assignReviewerId)
			? assignReviewerId
			: (snapshot.reviewers[0]?.id ?? "");
	const mounted = useSyncExternalStore(
		() => () => {},
		() => true,
		() => false,
	);

	useEffect(() => {
		let cancelled = false;
		let pollTimer: ReturnType<typeof setInterval> | null = null;
		let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
		let ws: WebSocket | null = null;
		let refetching = false;

		async function refetch(): Promise<void> {
			if (refetching) return;
			refetching = true;
			try {
				const response = await fetch(`/api/admin/events/${eventSlug}/cockpit`, {
					cache: "no-store",
				});
				const body = (await response.json()) as SnapshotResponse;
				if (!response.ok || !body.ok || !body.snapshot) {
					if (!cancelled) setLastError(body.error ?? `HTTP ${response.status}`);
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

		function scheduleReconnect(): void {
			if (cancelled || reconnectTimer !== null) return;
			reconnectTimer = setTimeout(() => {
				reconnectTimer = null;
				void connectWs();
			}, POLL_MS);
		}

		function startPolling(): void {
			if (cancelled || pollTimer !== null) return;
			setTransport("polling");
			pollTimer = setInterval(() => {
				void refetch();
			}, POLL_MS);
		}

		async function connectWs(): Promise<void> {
			const bootstrap = await bootstrapRoomTicket(eventSlug);
			if (cancelled) return;
			if (!bootstrap.ok) {
				setLastError(bootstrap.error);
				startPolling();
				scheduleReconnect();
				return;
			}
			const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
			const url = `${protocol}//${window.location.host}/api/admin/events/${eventSlug}/room`;

			try {
				ws = new WebSocket(url);
			} catch {
				startPolling();
				scheduleReconnect();
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
				scheduleReconnect();
			});

			ws.addEventListener("error", () => {
				ws?.close();
			});
		}

		void refetch();
		startPolling();
		void connectWs();

		return () => {
			cancelled = true;
			stopPolling();
			if (reconnectTimer !== null) clearTimeout(reconnectTimer);
			if (ws) {
				ws.close();
				ws = null;
			}
		};
	}, [eventSlug]);

	async function runAction(key: string, work: () => Promise<void>): Promise<void> {
		setPendingKey(key);
		setActionError(null);
		try {
			await work();
			const response = await fetch(`/api/admin/events/${eventSlug}/cockpit`, {
				cache: "no-store",
			});
			const body = (await response.json()) as SnapshotResponse;
			if (response.ok && body.ok && body.snapshot) setSnapshot(body.snapshot);
		} catch (error) {
			setActionError(error instanceof Error ? error.message : "Action failed");
		} finally {
			setPendingKey(null);
		}
	}

	async function requestJson(
		path: string,
		method: "POST" | "PATCH",
		body: unknown,
	): Promise<void> {
		const response = await fetch(path, {
			method,
			headers: { "content-type": "application/json" },
			body: JSON.stringify(body),
		});
		const data = (await response.json()) as { ok?: boolean; error?: string };
		if (!response.ok || data.ok === false) {
			throw new Error(data.error ?? `HTTP ${response.status}`);
		}
	}

	const counts = cockpitBlockerCounts(snapshot);
	const total = cockpitTotalBlockers(snapshot);
	const [pendingCoSpeakersExpanded, togglePendingCoSpeakers] = useExpanded();
	const [outstandingTasksExpanded, toggleOutstandingTasks] = useExpanded();
	const [needsReviewActivationExpanded, toggleNeedsReviewActivation] = useExpanded();
	const [unassignedReviewsExpanded, toggleUnassignedReviews] = useExpanded();
	const [incompleteReviewsExpanded, toggleIncompleteReviews] = useExpanded();
	const [reviewedUndecidedExpanded, toggleReviewedUndecided] = useExpanded();
	const [acceptedUnscheduledExpanded, toggleAcceptedUnscheduled] = useExpanded();
	const [scheduledUnpublishedExpanded, toggleScheduledUnpublished] = useExpanded();
	const [failedDeliveriesExpanded, toggleFailedDeliveries] = useExpanded();
	const visiblePendingCoSpeakers = cockpitSectionPreview(
		snapshot.pendingCoSpeakers,
		pendingCoSpeakersExpanded,
	);
	const visibleOutstandingTaskGroups = cockpitSectionPreview(
		snapshot.outstandingTasks.groups,
		outstandingTasksExpanded,
	);
	const visibleNeedsReviewActivation = cockpitSectionPreview(
		snapshot.needsReviewActivation,
		needsReviewActivationExpanded,
	);
	const visibleUnassignedReviews = cockpitSectionPreview(
		snapshot.unassignedReviews,
		unassignedReviewsExpanded,
	);
	const visibleIncompleteReviews = cockpitSectionPreview(
		snapshot.incompleteReviews,
		incompleteReviewsExpanded,
	);
	const visibleReviewedUndecided = cockpitSectionPreview(
		snapshot.reviewedUndecided,
		reviewedUndecidedExpanded,
	);
	const visibleAcceptedUnscheduled = cockpitSectionPreview(
		snapshot.acceptedUnscheduled,
		acceptedUnscheduledExpanded,
	);
	const visibleScheduledUnpublished = cockpitSectionPreview(
		snapshot.scheduledUnpublished,
		scheduledUnpublishedExpanded,
	);
	const visibleFailedDeliveries = cockpitSectionPreview(
		snapshot.failedDeliveries,
		failedDeliveriesExpanded,
	);

	return (
		<div className="space-y-6">
			<div className="flex flex-wrap items-center justify-between gap-3 text-sm">
				<p className="text-neutral-400">
					{total} blocker{total === 1 ? "" : "s"} across the program pipeline
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
						{mounted
							? `updated ${new Date(snapshot.fetchedAt).toLocaleTimeString()}`
							: "updated just now"}
					</span>
				</div>
			</div>

			<ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
				{(
					[
						["Tasks", counts.outstandingTasks, "tasks"],
						["Co-speakers", counts.pendingCoSpeakers, "co-speakers"],
						["Needs plan", counts.needsReviewActivation, "needs-plan"],
						["Unassigned", counts.unassignedReviews, "unassigned"],
						["Incomplete reviews", counts.incompleteReviews, "incomplete-reviews"],
						["Undecided", counts.reviewedUndecided, "undecided"],
						["Unscheduled", counts.acceptedUnscheduled, "unscheduled"],
						["Unpublished", counts.scheduledUnpublished, "unpublished"],
						["Failed email", counts.failedDeliveries, "failed-email"],
					] as const
				).map(([label, count, anchorKey]) => (
					<li
						key={label}
						className={`rounded-md border border-neutral-800 bg-neutral-900 px-3 py-2 last:col-span-2 sm:last:col-span-1${count === 0 ? " opacity-50" : ""}`}
					>
						{count > 0 ? (
							<a href={`#cockpit-${anchorKey}`} className="block hover:opacity-90">
								<p className="text-xs text-neutral-500">{label}</p>
								<p className="mt-0.5 text-lg font-medium tabular-nums text-neutral-100">
									{count}
								</p>
							</a>
						) : (
							<>
								<p className="text-xs text-neutral-600">{label}</p>
								<p className="mt-0.5 text-lg font-medium tabular-nums text-neutral-600">
									{count}
								</p>
							</>
						)}
					</li>
				))}
			</ul>

			{lastError ? (
				<p className={noticeClasses("warning")}>
					Couldn&apos;t refresh live data: {lastError}
				</p>
			) : null}
			{actionError ? <p className={noticeClasses("negative")}>{actionError}</p> : null}

			{total === 0 ? (
				<EmptyState
					title="All caught up"
					description="No pipeline blockers. Accept talks, wait for speakers, or open the schedule when the next wave lands."
				/>
			) : null}

			{snapshot.pendingCoSpeakers.length > 0 ? (
				<section
					id="cockpit-co-speakers"
					className="scroll-mt-4 rounded-lg border border-neutral-800 bg-neutral-900 px-4 py-3"
				>
					<div className="flex flex-wrap items-baseline justify-between gap-2">
						<p className="font-medium text-neutral-100">Co-speakers awaiting confirmation</p>
						<span className="text-xs text-neutral-500">
							{snapshot.pendingCoSpeakers.length} pending
						</span>
					</div>
					<ul className="mt-3 divide-y divide-neutral-800">
						{visiblePendingCoSpeakers.map((item) => (
							<li
								key={item.speakerId}
								className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm"
							>
								<span>
									<span className="font-medium text-neutral-200">
										{item.name || item.email}
									</span>
									<span className="text-neutral-500">
										{" · "}
										<Link
											href={`/admin/events/${eventSlug}/submissions/${item.submissionId}`}
											className="text-neutral-500 hover:text-neutral-100 hover:underline"
										>
											{item.submissionTitle}
										</Link>
									</span>
									{item.addedAfterAcceptance ? (
										<span className="ml-2 rounded-full border border-amber-500/30 bg-amber-500/10 px-1.5 text-[10px] font-medium uppercase tracking-wide text-amber-400">
											added late
										</span>
									) : null}
								</span>
								<div className="flex items-center gap-2">
									<StatusPill tone="warning">
										{item.invitedAt ? "invite sent" : "not invited"}
									</StatusPill>
									<Link
										href={`/admin/events/${eventSlug}/submissions`}
										className={buttonClasses("secondary", "sm")}
									>
										Open submissions
									</Link>
								</div>
							</li>
						))}
					</ul>
					<ShowMoreToggle
						itemCount={snapshot.pendingCoSpeakers.length}
						expanded={pendingCoSpeakersExpanded}
						onToggle={togglePendingCoSpeakers}
					/>
				</section>
			) : null}

			{snapshot.outstandingTasks.groups.length > 0 ? (
				<section
					id="cockpit-tasks"
					className="scroll-mt-4 rounded-lg border border-neutral-800 bg-neutral-900 px-4 py-3"
				>
					<div className="flex flex-wrap items-baseline justify-between gap-2">
						<p className="font-medium text-neutral-100">Outstanding required speaker tasks</p>
						<div className="flex items-center gap-2">
							<span className="text-xs text-neutral-500">
								{snapshot.outstandingTasks.incompleteCount} pending
							</span>
							<Button
								size="sm"
								disabled={pendingKey !== null}
								onClick={() =>
									void runAction("remind-all", () =>
										requestJson(`/api/admin/events/${eventSlug}/reminders`, "POST", {}),
									)
								}
							>
								Remind all
							</Button>
						</div>
					</div>
					<ul className="mt-3 space-y-3">
						{visibleOutstandingTaskGroups.map((group) => (
							<li key={group.key} className="rounded-md border border-neutral-800 px-3 py-2">
								<div className="flex flex-wrap items-baseline justify-between gap-2">
									<p className="font-medium text-neutral-100">
										<Link
											href={`/admin/events/${eventSlug}/submissions/${group.submissionId}`}
											className="font-medium text-neutral-100 hover:underline"
										>
											{group.submissionTitle}
										</Link>
										{" · "}
										{group.personName ?? group.personEmail}
									</p>
									<Button
										size="sm"
										disabled={pendingKey !== null}
										onClick={() =>
											void runAction(`remind-${group.personId}`, () =>
												requestJson(`/api/admin/events/${eventSlug}/reminders`, "POST", {
													personIds: [group.personId],
												}),
											)
										}
									>
										Remind
									</Button>
								</div>
								<p className="mt-1 text-xs text-neutral-500">{group.personEmail}</p>
								<ul className="mt-2 divide-y divide-neutral-800">
									{group.tasks.map((task) => (
										<li
											key={task.id}
											className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm"
										>
											<span className="font-medium text-neutral-200">
												{task.templateLabel}
											</span>
											<span className="flex items-center gap-2">
												<span className="text-xs text-neutral-500">
													{task.templateKind} · required
												</span>
												<StatusPill tone="warning">{task.status}</StatusPill>
											</span>
										</li>
									))}
								</ul>
							</li>
						))}
					</ul>
					<ShowMoreToggle
						itemCount={snapshot.outstandingTasks.groups.length}
						expanded={outstandingTasksExpanded}
						onToggle={toggleOutstandingTasks}
					/>
				</section>
			) : null}

			{snapshot.needsReviewActivation.length > 0 ? (
				<section
					id="cockpit-needs-plan"
					className="scroll-mt-4 rounded-lg border border-neutral-800 bg-neutral-900 px-4 py-3"
				>
					<div className="flex flex-wrap items-baseline justify-between gap-2">
						<div>
							<p className="font-medium text-neutral-100">Review plan not active</p>
							<p className="mt-1 text-xs text-neutral-500">
								Submitted proposals are waiting for an evaluation plan.
							</p>
						</div>
						<div className="flex items-center gap-2">
							{cockpitSectionCaption(
								snapshot.needsReviewActivation.length,
								snapshot.needsReviewActivationTotal,
							) ? (
								<span className="text-xs text-neutral-500">
									{cockpitSectionCaption(
										snapshot.needsReviewActivation.length,
										snapshot.needsReviewActivationTotal,
									)}
								</span>
							) : null}
							<Link
								href={`/admin/events/${eventSlug}/review`}
								className={buttonClasses("secondary", "sm")}
							>
								Activate plan
							</Link>
						</div>
					</div>
					<ul className="mt-3 divide-y divide-neutral-800">
						{visibleNeedsReviewActivation.map((item) => (
							<li
								key={item.submissionId}
								className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm"
							>
								<span>
									<Link
										href={`/admin/events/${eventSlug}/submissions/${item.submissionId}`}
										className="font-medium text-neutral-200 hover:text-neutral-100 hover:underline"
									>
										{item.title}
									</Link>
									<span className="text-neutral-500"> · {item.submitter}</span>
								</span>
								<StatusPill tone="warning">awaiting plan</StatusPill>
							</li>
						))}
					</ul>
					<ShowMoreToggle
						itemCount={snapshot.needsReviewActivation.length}
						expanded={needsReviewActivationExpanded}
						onToggle={toggleNeedsReviewActivation}
					/>
				</section>
			) : null}

			{snapshot.unassignedReviews.length > 0 ? (
				<section
					id="cockpit-unassigned"
					className="scroll-mt-4 rounded-lg border border-neutral-800 bg-neutral-900 px-4 py-3"
				>
					<div className="flex flex-wrap items-end justify-between gap-2">
						<div>
							<p className="font-medium text-neutral-100">No reviewer assignment</p>
							<p className="mt-1 text-xs text-neutral-500">
								{snapshot.activePlanId
									? "Assign from the active plan."
									: "Activate an evaluation plan first."}
							</p>
						</div>
						{snapshot.activePlanId && snapshot.reviewers.length > 0 ? (
							<label className="text-xs text-neutral-400">
								Reviewer
								<select
									value={selectedReviewerId}
									onChange={(event) => setAssignReviewerId(event.target.value)}
									className="ml-2 rounded-md border border-neutral-700 bg-neutral-950 px-2 py-1 text-neutral-200"
								>
									{snapshot.reviewers.map((reviewer) => (
										<option key={reviewer.id} value={reviewer.id}>
											{reviewer.name}
										</option>
									))}
								</select>
							</label>
						) : (
							<Link
								href={`/admin/events/${eventSlug}/review`}
								className={buttonClasses("secondary", "sm")}
							>
								Open review
							</Link>
						)}
					</div>
					<ul className="mt-3 divide-y divide-neutral-800">
						{visibleUnassignedReviews.map((item) => (
							<li
								key={item.submissionId}
								className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm"
							>
								<span>
									<Link
										href={`/admin/events/${eventSlug}/submissions/${item.submissionId}`}
										className="font-medium text-neutral-200 hover:text-neutral-100 hover:underline"
									>
										{item.title}
									</Link>
									<span className="text-neutral-500"> · {item.submitter}</span>
								</span>
								{snapshot.activePlanId && selectedReviewerId ? (
									<Button
										size="sm"
										disabled={pendingKey !== null}
										onClick={() =>
											void runAction(`assign-${item.submissionId}`, () =>
												requestJson(`/api/admin/events/${eventSlug}/review/assignments`, "POST", {
													submissionIds: [item.submissionId],
													reviewerIds: [selectedReviewerId],
												}),
											)
										}
									>
										Assign
									</Button>
								) : null}
							</li>
						))}
					</ul>
					<ShowMoreToggle
						itemCount={snapshot.unassignedReviews.length}
						expanded={unassignedReviewsExpanded}
						onToggle={toggleUnassignedReviews}
					/>
				</section>
			) : null}

			{snapshot.incompleteReviews.length > 0 ? (
				<section
					id="cockpit-incomplete-reviews"
					className="scroll-mt-4 rounded-lg border border-neutral-800 bg-neutral-900 px-4 py-3"
				>
					<div className="flex flex-wrap items-baseline justify-between gap-2">
						<p className="font-medium text-neutral-100">Incomplete assigned reviews</p>
						<Link
							href={`/admin/events/${eventSlug}/review`}
							className={buttonClasses("secondary", "sm")}
						>
							Open review
						</Link>
					</div>
					<ul className="mt-3 divide-y divide-neutral-800">
						{visibleIncompleteReviews.map((item) => (
							<li
								key={item.assignmentId}
								className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm"
							>
								<span>
									<Link
										href={`/admin/events/${eventSlug}/submissions/${item.submissionId}`}
										className="font-medium text-neutral-200 hover:text-neutral-100 hover:underline"
									>
										{item.title}
									</Link>
									<span className="text-neutral-500">
										{" "}
										· {item.reviewerName} · {item.submitter}
									</span>
								</span>
								<StatusPill tone="warning">awaiting score</StatusPill>
							</li>
						))}
					</ul>
					<ShowMoreToggle
						itemCount={snapshot.incompleteReviews.length}
						expanded={incompleteReviewsExpanded}
						onToggle={toggleIncompleteReviews}
					/>
				</section>
			) : null}

			{snapshot.reviewedUndecided.length > 0 ? (
				<section
					id="cockpit-undecided"
					className="scroll-mt-4 rounded-lg border border-neutral-800 bg-neutral-900 px-4 py-3"
				>
					<div className="flex flex-wrap items-baseline justify-between gap-2">
						<p className="font-medium text-neutral-100">Reviewed but undecided</p>
						<span className="text-xs text-neutral-500">Decisions send no email from here</span>
					</div>
					<ul className="mt-3 divide-y divide-neutral-800">
						{visibleReviewedUndecided.map((item) => (
							<li
								key={item.submissionId}
								className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm"
							>
								<span>
									<Link
										href={`/admin/events/${eventSlug}/submissions/${item.submissionId}`}
										className="font-medium text-neutral-200 hover:text-neutral-100 hover:underline"
									>
										{item.title}
									</Link>
									<span className="text-neutral-500"> · {item.submitter}</span>
								</span>
								<span className="flex gap-2">
									<Button
										size="sm"
										disabled={pendingKey !== null}
										onClick={() =>
											void runAction(`accept-${item.submissionId}`, () =>
												requestJson(
													`/api/admin/events/${eventSlug}/submissions/${item.submissionId}/decide`,
													"POST",
													{ action: "accept", email: { send: false } },
												),
											)
										}
									>
										Accept
									</Button>
									<Button
										size="sm"
										disabled={pendingKey !== null}
										onClick={() =>
											void runAction(`reject-${item.submissionId}`, () =>
												requestJson(
													`/api/admin/events/${eventSlug}/submissions/${item.submissionId}/decide`,
													"POST",
													{ action: "reject", email: { send: false } },
												),
											)
										}
									>
										Reject
									</Button>
								</span>
							</li>
						))}
					</ul>
					<ShowMoreToggle
						itemCount={snapshot.reviewedUndecided.length}
						expanded={reviewedUndecidedExpanded}
						onToggle={toggleReviewedUndecided}
					/>
				</section>
			) : null}

			{snapshot.acceptedUnscheduled.length > 0 ? (
				<section
					id="cockpit-unscheduled"
					className="scroll-mt-4 rounded-lg border border-neutral-800 bg-neutral-900 px-4 py-3"
				>
					<div className="flex flex-wrap items-baseline justify-between gap-2">
						<p className="font-medium text-neutral-100">Accepted but unscheduled</p>
						<Link
							href={`/admin/events/${eventSlug}/schedule`}
							className={buttonClasses("secondary", "sm")}
						>
							Open schedule
						</Link>
					</div>
					<ul className="mt-3 divide-y divide-neutral-800">
						{visibleAcceptedUnscheduled.map((item) => (
							<li
								key={item.submissionId}
								className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm"
							>
								<span>
									<Link
										href={`/admin/events/${eventSlug}/submissions/${item.submissionId}`}
										className="font-medium text-neutral-200 hover:text-neutral-100 hover:underline"
									>
										{item.title}
									</Link>
									<span className="text-neutral-500"> · {item.submitter}</span>
								</span>
								<StatusPill tone="warning">needs slot</StatusPill>
							</li>
						))}
					</ul>
					<ShowMoreToggle
						itemCount={snapshot.acceptedUnscheduled.length}
						expanded={acceptedUnscheduledExpanded}
						onToggle={toggleAcceptedUnscheduled}
					/>
				</section>
			) : null}

			{snapshot.scheduledUnpublished.length > 0 ? (
				<section
					id="cockpit-unpublished"
					className="scroll-mt-4 rounded-lg border border-neutral-800 bg-neutral-900 px-4 py-3"
				>
					<div className="flex flex-wrap items-baseline justify-between gap-2">
						<p className="font-medium text-neutral-100">Scheduled but unpublished</p>
						<Button
							size="sm"
							disabled={pendingKey !== null}
							onClick={() =>
								void runAction("publish-all", () =>
									requestJson(`/api/admin/events/${eventSlug}/sessions/bulk-publish`, "POST", {
										action: "publish",
										approveContent: true,
										sessionIds: snapshot.scheduledUnpublished.map(
											(item) => item.submissionId,
										),
									}),
								)
							}
						>
							Approve &amp; publish all
						</Button>
					</div>
					<ul className="mt-3 divide-y divide-neutral-800">
						{visibleScheduledUnpublished.map((item) => (
							<li
								key={item.submissionId}
								className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm"
							>
								<span>
									<Link
										href={`/admin/events/${eventSlug}/submissions/${item.submissionId}`}
										className="font-medium text-neutral-200 hover:text-neutral-100 hover:underline"
									>
										{item.title}
									</Link>
									<span className="text-neutral-500"> · {item.submitter}</span>
								</span>
								<Button
									size="sm"
									disabled={pendingKey !== null}
									onClick={() =>
										void runAction(`publish-${item.submissionId}`, () =>
											requestJson(
												`/api/admin/events/${eventSlug}/submissions/${item.submissionId}/schedule`,
												"PATCH",
												{ action: "publish", approveContent: true },
											),
										)
									}
								>
									Approve &amp; publish
								</Button>
							</li>
						))}
					</ul>
					<ShowMoreToggle
						itemCount={snapshot.scheduledUnpublished.length}
						expanded={scheduledUnpublishedExpanded}
						onToggle={toggleScheduledUnpublished}
					/>
				</section>
			) : null}

			{snapshot.failedDeliveries.length > 0 ? (
				<section
					id="cockpit-failed-email"
					className="scroll-mt-4 rounded-lg border border-neutral-800 bg-neutral-900 px-4 py-3"
				>
					<div className="flex flex-wrap items-baseline justify-between gap-2">
						<p className="font-medium text-neutral-100">Failed email deliveries</p>
						<Link
							href={`/admin/events/${eventSlug}/communications`}
							className={buttonClasses("secondary", "sm")}
						>
							Communications
						</Link>
					</div>
					<ul className="mt-3 divide-y divide-neutral-800">
						{visibleFailedDeliveries.map((delivery) => (
							<li
								key={delivery.deliveryKey}
								className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm"
							>
								<span>
									<span className="font-medium text-neutral-200">
										{delivery.templateKey} · {delivery.toEmail}
									</span>
									{delivery.error ? (
										<span className="mt-1 block text-xs text-red-300">
											{delivery.error}
										</span>
									) : null}
								</span>
								{delivery.replayable ? (
									<Button
										size="sm"
										disabled={pendingKey !== null}
										onClick={() =>
											void runAction(`retry-${delivery.deliveryKey}`, async () => {
												const response = await fetch(
													`/api/admin/events/${eventSlug}/communications/${encodeURIComponent(delivery.deliveryKey)}/retry`,
													{ method: "POST" },
												);
												const data = (await response.json()) as {
													ok?: boolean;
													error?: string;
												};
												if (!response.ok || !data.ok) {
													throw new Error(data.error ?? "Retry failed");
												}
											})
										}
									>
										Retry
									</Button>
								) : (
									<StatusPill tone="negative">no envelope</StatusPill>
								)}
							</li>
						))}
					</ul>
					<ShowMoreToggle
						itemCount={snapshot.failedDeliveries.length}
						expanded={failedDeliveriesExpanded}
						onToggle={toggleFailedDeliveries}
					/>
				</section>
			) : null}
		</div>
	);
}
