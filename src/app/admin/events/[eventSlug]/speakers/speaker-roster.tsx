"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { buttonClasses, INPUT_CLASSES, noticeClasses, StatusPill } from "@/components/ui";
import {
	SPEAKER_WORKFLOW_STATUSES,
	SOCIAL_KEYS,
	type RosterSpeaker,
	type SpeakerSocials,
	type SpeakerWorkflowStatus,
} from "@/lib/speakers/roster";

type Props = {
	eventSlug: string;
	initialSpeakers: RosterSpeaker[];
	initialStatus: string;
	initialQuery: string;
};

type Draft = {
	personId: string | null;
	name: string;
	email: string;
	jobTitle: string;
	company: string;
	workflowStatus: SpeakerWorkflowStatus;
	socials: SpeakerSocials;
};

const emptyDraft = (): Draft => ({
	personId: null,
	name: "",
	email: "",
	jobTitle: "",
	company: "",
	workflowStatus: "invited",
	socials: {},
});

function workflowTone(status: SpeakerWorkflowStatus): "neutral" | "positive" | "warning" | "negative" {
	switch (status) {
		case "confirmed":
			return "positive";
		case "invited":
			return "warning";
		case "declined":
		case "withdrawn":
			return "negative";
		default: {
			const _exhaustive: never = status;
			return _exhaustive;
		}
	}
}

export function SpeakerRoster({ eventSlug, initialSpeakers, initialStatus, initialQuery }: Props) {
	const router = useRouter();
	const [speakers, setSpeakers] = useState(initialSpeakers);
	const [status, setStatus] = useState(initialStatus);
	const [q, setQ] = useState(initialQuery);
	const [draft, setDraft] = useState<Draft>(emptyDraft);
	const [csv, setCsv] = useState("email,name,job_title,company,workflow_status,twitter,linkedin,github,website\n");
	const [pending, setPending] = useState(false);
	const [notice, setNotice] = useState<string | null>(null);

	const visible = useMemo(() => {
		const needle = q.trim().toLowerCase();
		return speakers.filter((speaker) => {
			if (status !== "all" && speaker.workflowStatus !== status) return false;
			if (!needle) return true;
			return [
				speaker.name,
				speaker.email,
				speaker.jobTitle ?? "",
				speaker.company ?? "",
				...Object.values(speaker.socials),
			]
				.join(" ")
				.toLowerCase()
				.includes(needle);
		});
	}, [speakers, status, q]);

	function syncUrl(nextStatus: string, nextQ: string) {
		const params = new URLSearchParams();
		if (nextStatus !== "all") params.set("status", nextStatus);
		if (nextQ.trim()) params.set("q", nextQ.trim());
		const suffix = params.toString();
		router.replace(`/admin/events/${eventSlug}/speakers${suffix ? `?${suffix}` : ""}`);
	}

	async function refresh() {
		const params = new URLSearchParams();
		if (status !== "all") params.set("status", status);
		if (q.trim()) params.set("q", q.trim());
		const response = await fetch(`/api/admin/events/${eventSlug}/speakers?${params}`);
		const data = await response.json() as { ok?: boolean; speakers?: RosterSpeaker[]; error?: string };
		if (!response.ok || !data.ok || !data.speakers) {
			setNotice(data.error ?? "Could not refresh roster");
			return;
		}
		setSpeakers(data.speakers);
		router.refresh();
	}

	async function saveSpeaker() {
		setPending(true);
		setNotice(null);
		try {
			const path = draft.personId
				? `/api/admin/events/${eventSlug}/speakers/${encodeURIComponent(draft.personId)}`
				: `/api/admin/events/${eventSlug}/speakers`;
			const response = await fetch(path, {
				method: draft.personId ? "PATCH" : "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({
					name: draft.name,
					email: draft.email,
					jobTitle: draft.jobTitle,
					company: draft.company,
					workflowStatus: draft.workflowStatus,
					socials: draft.socials,
				}),
			});
			const data = await response.json() as { ok?: boolean; error?: string };
			if (!response.ok || !data.ok) setNotice(data.error ?? "Save failed");
			else {
				setNotice(draft.personId ? "Speaker updated." : "Speaker added.");
				setDraft(emptyDraft());
				await refresh();
			}
		} catch {
			setNotice("Network error");
		} finally {
			setPending(false);
		}
	}

	async function importCsv() {
		setPending(true);
		setNotice(null);
		try {
			const response = await fetch(`/api/admin/events/${eventSlug}/speakers`, {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ csv }),
			});
			const data = await response.json() as {
				ok?: boolean;
				imported?: number;
				updated?: number;
				error?: string;
			};
			if (!response.ok || !data.ok) setNotice(data.error ?? "Import failed");
			else {
				setNotice(`Imported ${data.imported ?? 0}, updated ${data.updated ?? 0}.`);
				await refresh();
			}
		} catch {
			setNotice("Network error");
		} finally {
			setPending(false);
		}
	}

	async function bulkEmail() {
		setPending(true);
		setNotice(null);
		try {
			const response = await fetch(`/api/admin/events/${eventSlug}/speakers/email`, {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({
					personIds: visible.map((speaker) => speaker.personId),
				}),
			});
			const data = await response.json() as {
				ok?: boolean;
				sent?: number;
				skipped?: number;
				error?: string;
			};
			if (!response.ok || !data.ok) setNotice(data.error ?? "Bulk email failed");
			else setNotice(`${data.sent ?? 0} sent, ${data.skipped ?? 0} skipped (templated task_reminder).`);
		} catch {
			setNotice("Network error");
		} finally {
			setPending(false);
		}
	}

	function edit(speaker: RosterSpeaker) {
		setDraft({
			personId: speaker.personId,
			name: speaker.name,
			email: speaker.email,
			jobTitle: speaker.jobTitle ?? "",
			company: speaker.company ?? "",
			workflowStatus: speaker.workflowStatus,
			socials: { ...speaker.socials },
		});
		setNotice(null);
	}

	return (
		<div className="space-y-8">
			<section className="rounded-lg border border-neutral-800 bg-neutral-900 p-4">
				<div className="flex flex-wrap items-end gap-3">
					<label className="text-sm text-neutral-300">
						Search
						<input
							value={q}
							onChange={(event) => {
								setQ(event.target.value);
								syncUrl(status, event.target.value);
							}}
							placeholder="Name, email, company…"
							className={`mt-1 w-64 ${INPUT_CLASSES}`}
						/>
					</label>
					<label className="text-sm text-neutral-300">
						Status
						<select
							value={status}
							onChange={(event) => {
								setStatus(event.target.value);
								syncUrl(event.target.value, q);
							}}
							className={`mt-1 ${INPUT_CLASSES}`}
						>
							<option value="all">All</option>
							{SPEAKER_WORKFLOW_STATUSES.map((value) => (
								<option key={value} value={value}>{value}</option>
							))}
						</select>
					</label>
					<button
						type="button"
						disabled={pending || visible.length === 0}
						onClick={() => void bulkEmail()}
						className={buttonClasses("secondary", "sm")}
					>
						Email filtered ({visible.length})
					</button>
					<Link
						href={`/admin/events/${eventSlug}/tasks`}
						className="text-xs text-neutral-400 underline underline-offset-2 hover:text-neutral-200"
					>
						Open speaker tasks
					</Link>
				</div>
			</section>

			<section className="rounded-lg border border-neutral-800 bg-neutral-900">
				{visible.length === 0 ? (
					<p className="px-4 py-8 text-sm text-neutral-500">No speakers match this filter.</p>
				) : (
					<ul className="divide-y divide-neutral-800">
						{visible.map((speaker) => (
							<li key={speaker.personId} className="px-4 py-3 text-sm">
								<div className="flex flex-wrap items-start justify-between gap-3">
									<div>
										<p className="font-medium text-neutral-100">
											{speaker.name}
											<span className="font-normal text-neutral-500"> · {speaker.email}</span>
										</p>
										<p className="mt-1 text-neutral-400">
											{[speaker.jobTitle, speaker.company].filter(Boolean).join(" · ") || "No title/company"}
											{speaker.submissionStatuses.length
												? ` · submissions: ${speaker.submissionStatuses.join(", ")}`
												: " · roster-only"}
										</p>
										{speaker.tasks.length > 0 ? (
											<p className="mt-1 text-xs text-neutral-500">
												{speaker.pendingTaskCount} pending task{speaker.pendingTaskCount === 1 ? "" : "s"}
												{speaker.earliestDueAt
													? ` · next due ${new Date(speaker.earliestDueAt).toLocaleDateString()}`
													: ""}
												{" · "}
												<Link
													href={`/admin/events/${eventSlug}/tasks`}
													className="underline underline-offset-2 hover:text-neutral-300"
												>
													view tasks
												</Link>
												{" · "}
												<Link
													href="/portal"
													className="underline underline-offset-2 hover:text-neutral-300"
												>
													portal
												</Link>
											</p>
										) : null}
										{Object.keys(speaker.socials).length > 0 ? (
											<p className="mt-1 text-xs text-neutral-500">
												{SOCIAL_KEYS.filter((key) => speaker.socials[key]).map((key) => (
													<span key={key} className="mr-3">{key}: {speaker.socials[key]}</span>
												))}
											</p>
										) : null}
									</div>
									<div className="flex items-center gap-2">
										<StatusPill tone={workflowTone(speaker.workflowStatus)}>
											{speaker.workflowStatus}
										</StatusPill>
										<button
											type="button"
											disabled={pending}
											onClick={() => edit(speaker)}
											className={buttonClasses("secondary", "sm")}
										>
											Edit
										</button>
									</div>
								</div>
							</li>
						))}
					</ul>
				)}
			</section>

			<section className="rounded-lg border border-neutral-800 bg-neutral-900 p-4">
				<div className="flex flex-wrap items-baseline justify-between gap-2">
					<h2 className="font-medium text-neutral-100">
						{draft.personId ? "Edit speaker" : "Add speaker"}
					</h2>
					{draft.personId ? (
						<button
							type="button"
							className="text-xs text-neutral-400 underline underline-offset-2"
							onClick={() => setDraft(emptyDraft())}
						>
							Clear
						</button>
					) : null}
				</div>
				<div className="mt-3 grid gap-3 md:grid-cols-2">
					<label className="text-sm text-neutral-300">Name<input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} className={`mt-1 w-full ${INPUT_CLASSES}`} /></label>
					<label className="text-sm text-neutral-300">Email<input value={draft.email} onChange={(event) => setDraft({ ...draft, email: event.target.value })} className={`mt-1 w-full ${INPUT_CLASSES}`} /></label>
					<label className="text-sm text-neutral-300">Job title<input value={draft.jobTitle} onChange={(event) => setDraft({ ...draft, jobTitle: event.target.value })} className={`mt-1 w-full ${INPUT_CLASSES}`} /></label>
					<label className="text-sm text-neutral-300">Company<input value={draft.company} onChange={(event) => setDraft({ ...draft, company: event.target.value })} className={`mt-1 w-full ${INPUT_CLASSES}`} /></label>
					<label className="text-sm text-neutral-300">
						Workflow status
						<select
							value={draft.workflowStatus}
							onChange={(event) => setDraft({ ...draft, workflowStatus: event.target.value as SpeakerWorkflowStatus })}
							className={`mt-1 w-full ${INPUT_CLASSES}`}
						>
							{SPEAKER_WORKFLOW_STATUSES.map((value) => (
								<option key={value} value={value}>{value}</option>
							))}
						</select>
					</label>
					{SOCIAL_KEYS.map((key) => (
						<label key={key} className="text-sm text-neutral-300">
							{key}
							<input
								value={draft.socials[key] ?? ""}
								onChange={(event) => setDraft({
									...draft,
									socials: { ...draft.socials, [key]: event.target.value },
								})}
								className={`mt-1 w-full ${INPUT_CLASSES}`}
							/>
						</label>
					))}
				</div>
				<button
					type="button"
					disabled={pending || !draft.name.trim() || !draft.email.trim()}
					onClick={() => void saveSpeaker()}
					className={`mt-4 ${buttonClasses("primary", "sm")}`}
				>
					{pending ? "Saving…" : draft.personId ? "Save changes" : "Add to roster"}
				</button>
			</section>

			<section className="rounded-lg border border-neutral-800 bg-neutral-900 p-4">
				<h2 className="font-medium text-neutral-100">Import CSV</h2>
				<p className="mt-1 text-sm text-neutral-400">
					Columns: email, name, job_title, company, workflow_status, twitter, linkedin, github, website.
				</p>
				<textarea
					aria-label="Speaker CSV"
					value={csv}
					onChange={(event) => setCsv(event.target.value)}
					rows={6}
					className={`mt-3 w-full font-mono text-xs ${INPUT_CLASSES}`}
				/>
				<button
					type="button"
					disabled={pending || csv.trim().length === 0}
					onClick={() => void importCsv()}
					className={`mt-3 ${buttonClasses("secondary", "sm")}`}
				>
					Import speakers
				</button>
			</section>

			{notice ? (
				<p className={noticeClasses(notice.toLowerCase().includes("fail") || notice === "Network error" ? "negative" : "positive")}>
					{notice}
				</p>
			) : null}
		</div>
	);
}
