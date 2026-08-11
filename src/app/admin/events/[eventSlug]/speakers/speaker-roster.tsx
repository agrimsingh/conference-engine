"use client";

import Link from "next/link";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import { buttonClasses, EmptyState, INPUT_CLASSES, noticeClasses, StatusPill } from "@/components/ui";
import { emptyNextActionHref } from "@/lib/admin/empty-next-action";
import {
	ContentConsole,
	type ContentSession,
	type ContentSpeaker,
} from "../content/content-console";
import {
	SPEAKER_WORKFLOW_STATUSES,
	SOCIAL_KEYS,
	type RosterSpeaker,
	type SpeakerSocials,
	type SpeakerWorkflowStatus,
} from "@/lib/speakers/roster";
import { renderSpeakerAnnouncementPreview } from "@/lib/speakers/operations";
import type { SpeakerCrmDetail, SpeakerCrmOwnerOption } from "@/lib/speakers/crm";
import { resolveSpeakerCrmLoad } from "@/lib/speakers/crm-load";
import { formatTaskDueAt } from "@/lib/speakers/task-display";

type Props = {
	eventSlug: string;
	initialSpeakers: RosterSpeaker[];
	initialStatus: string;
	initialQuery: string;
	eventName: string;
	crmOwners: SpeakerCrmOwnerOption[];
	contentSessions: ContentSession[];
	contentSpeakers: ContentSpeaker[];
};

type Draft = {
	personId: string | null;
	name: string;
	email: string;
	jobTitle: string;
	company: string;
	bio: string;
	logisticsText: string;
	workflowStatus: SpeakerWorkflowStatus;
	socials: SpeakerSocials;
};

const emptyDraft = (): Draft => ({
	personId: null,
	name: "",
	email: "",
	jobTitle: "",
	company: "",
	bio: "",
	logisticsText: "",
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

type SpeakerPanel = "roster" | "add" | "import" | "content-sessions" | "content-speakers";

function parsePanel(value: string | null): SpeakerPanel {
	switch (value) {
		case "add":
		case "import":
		case "content-sessions":
		case "content-speakers":
			return value;
		default:
			return "roster";
	}
}

const SPEAKER_PANELS: Array<{ id: SpeakerPanel; label: string; description: string }> = [
	{ id: "roster", label: "Roster", description: "Search, filter, email, and open CRM." },
	{ id: "add", label: "Add / edit", description: "Create a roster entry or edit the selected speaker." },
	{ id: "import", label: "Import CSV", description: "Bulk import speaker profiles." },
	{
		id: "content-sessions",
		label: "Session content",
		description:
			"Each save is a new draft. Approve to show that version on the public schedule and embeds.",
	},
	{
		id: "content-speakers",
		label: "Speaker content",
		description: "Edit bios and headshots with revision history.",
	},
];

export function SpeakerRoster({
	eventSlug,
	eventName,
	initialSpeakers,
	initialStatus,
	initialQuery,
	crmOwners,
	contentSessions,
	contentSpeakers,
}: Props) {
	const router = useRouter();
	const searchParams = useSearchParams();
	const panel = parsePanel(searchParams.get("panel"));
	const [speakers, setSpeakers] = useState(initialSpeakers);
	const [status, setStatus] = useState(initialStatus);
	const [q, setQ] = useState(initialQuery);
	const [draft, setDraft] = useState<Draft>(emptyDraft);
	const [csv, setCsv] = useState("email,name,job_title,company,bio,logistics,workflow_status,twitter,linkedin,github,website,facebook\n");
	const [emailTemplateKey, setEmailTemplateKey] = useState<"task_reminder" | "speaker_announcement">("task_reminder");
	const [emailSubject, setEmailSubject] = useState("Update from {{event_name}}");
	const [emailBody, setEmailBody] = useState("Hi {{submitter_name}},\n\n");
	const [pending, setPending] = useState(false);
	const [notice, setNotice] = useState<string | null>(null);
	const [selectedRecipients, setSelectedRecipients] = useState<string[]>(initialSpeakers.map((speaker) => speaker.personId));
	const [crmSpeakerId, setCrmSpeakerId] = useState<string | null>(null);
	const [crmDetail, setCrmDetail] = useState<SpeakerCrmDetail | null>(null);
	const [crmOwnerAccountId, setCrmOwnerAccountId] = useState("");
	const [crmTags, setCrmTags] = useState("");
	const [crmNote, setCrmNote] = useState("");
	const [crmContactNote, setCrmContactNote] = useState("");

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

	const setPanel = useCallback(
		(next: SpeakerPanel) => {
			const params = new URLSearchParams(searchParams.toString());
			if (next === "roster") params.delete("panel");
			else params.set("panel", next);
			const query = params.toString();
			router.replace(
				query
					? `/admin/events/${eventSlug}/speakers?${query}`
					: `/admin/events/${eventSlug}/speakers`,
				{ scroll: false },
			);
		},
		[eventSlug, router, searchParams],
	);

	function syncUrl(nextStatus: string, nextQ: string) {
		const params = new URLSearchParams(searchParams.toString());
		if (nextStatus !== "all") params.set("status", nextStatus);
		else params.delete("status");
		if (nextQ.trim()) params.set("q", nextQ.trim());
		else params.delete("q");
		const query = params.toString();
		router.replace(
			query
				? `/admin/events/${eventSlug}/speakers?${query}`
				: `/admin/events/${eventSlug}/speakers`,
			{ scroll: false },
		);
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
					bio: draft.bio,
					logisticsText: draft.logisticsText,
					workflowStatus: draft.workflowStatus,
					socials: draft.socials,
				}),
			});
			const data = await response.json() as { ok?: boolean; error?: string };
			if (!response.ok || !data.ok) setNotice(data.error ?? "Save failed");
			else {
				setNotice(draft.personId ? "Speaker updated." : "Speaker added.");
				setDraft(emptyDraft());
				setPanel("roster");
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
			const payload: Record<string, unknown> = {
				personIds: visible.filter((speaker) => selectedRecipients.includes(speaker.personId)).map((speaker) => speaker.personId),
				templateKey: emailTemplateKey,
			};
			if (emailTemplateKey === "speaker_announcement") {
				payload.subject = emailSubject;
				payload.text = emailBody;
			}
			const response = await fetch(`/api/admin/events/${eventSlug}/speakers/email`, {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify(payload),
			});
			const data = await response.json() as {
				ok?: boolean;
				sent?: number;
				skipped?: number;
				templateKey?: string;
				error?: string;
			};
			if (!response.ok || !data.ok) setNotice(data.error ?? "Bulk email failed");
			else {
				const key = data.templateKey ?? emailTemplateKey;
				setNotice(`${data.sent ?? 0} sent, ${data.skipped ?? 0} skipped (${key}).`);
			}
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
			bio: speaker.bio ?? "",
			logisticsText: speaker.logisticsText ?? "",
			workflowStatus: speaker.workflowStatus,
			socials: { ...speaker.socials },
		});
		setPanel("add");
		setNotice(null);
	}

	const activePanel = SPEAKER_PANELS.find((item) => item.id === panel) ?? SPEAKER_PANELS[0]!;

	async function invite(personId: string) { setPending(true); setNotice(null); try { const response = await fetch(`/api/admin/events/${eventSlug}/speakers/${encodeURIComponent(personId)}/invite`, { method: "POST" }); const value = await response.json() as { ok?: boolean; error?: string }; setNotice(response.ok && value.ok ? "Portal invitation sent and logged in Communications." : value.error ?? "Invite failed"); } catch { setNotice("Network error"); } finally { setPending(false); } }

	async function copyPortalSignInLink(personId: string) {
		setPending(true);
		setNotice(null);
		try {
			const response = await fetch(
				`/api/admin/events/${eventSlug}/speakers/${encodeURIComponent(personId)}/portal-link`,
				{ method: "POST" },
			);
			const value = (await response.json()) as {
				ok?: boolean;
				portalUrl?: string;
				error?: string;
			};
			if (!response.ok || !value.ok || !value.portalUrl) {
				setNotice(value.error ?? "Could not mint portal sign-in link");
				return;
			}
			try {
				await navigator.clipboard.writeText(value.portalUrl);
				setNotice("Portal sign-in link copied. It is one-time and expires soon.");
			} catch {
				setNotice(`Copy manually: ${value.portalUrl}`);
			}
		} catch {
			setNotice("Network error");
		} finally {
			setPending(false);
		}
	}

	async function openCrm(speaker: RosterSpeaker) {
		setPending(true);
		setNotice(null);
		setCrmSpeakerId(speaker.personId);
		setCrmDetail(null);
		try {
			const response = await fetch(`/api/admin/events/${eventSlug}/speakers/${encodeURIComponent(speaker.personId)}/crm`);
			const data = await response.json() as { ok?: boolean; crm?: SpeakerCrmDetail; error?: string };
			const result = resolveSpeakerCrmLoad(response.ok, data);
			if (result.kind === "failure") {
				closeCrmDrawer();
				setNotice(result.error);
				return;
			}
			const crm = result.crm;
			setCrmDetail(crm);
			setCrmOwnerAccountId(crm.owner?.accountId ?? "");
			setCrmTags(crm.tags.join(", "));
			setCrmNote("");
			setCrmContactNote("");
		} catch {
			closeCrmDrawer();
			setNotice("Network error");
		} finally {
			setPending(false);
		}
	}

	function closeCrmDrawer() {
		setCrmSpeakerId(null);
		setCrmDetail(null);
	}

	async function saveCrm() {
		if (!crmSpeakerId) return;
		setPending(true);
		setNotice(null);
		try {
			const payload: { ownerAccountId: string | null; tags: string[]; note?: string; contactNote?: string } = {
				ownerAccountId: crmOwnerAccountId || null,
				tags: crmTags.split(",").map((tag) => tag.trim()).filter(Boolean),
			};
			if (crmNote.trim()) payload.note = crmNote;
			if (crmContactNote.trim()) payload.contactNote = crmContactNote;
			const response = await fetch(`/api/admin/events/${eventSlug}/speakers/${encodeURIComponent(crmSpeakerId)}/crm`, {
				method: "PATCH",
				headers: { "content-type": "application/json" },
				body: JSON.stringify(payload),
			});
			const data = await response.json() as { ok?: boolean; crm?: SpeakerCrmDetail; error?: string };
			if (!response.ok || !data.ok || !data.crm) {
				setNotice(data.error ?? "Could not save speaker CRM");
				return;
			}
			const crm = data.crm;
			setCrmDetail(crm);
			setCrmNote("");
			setCrmContactNote("");
			setSpeakers((current) => current.map((speaker) => speaker.personId === crmSpeakerId
				? { ...speaker, crm: { owner: crm.owner, tags: crm.tags, lastContactAt: crm.lastContactAt } }
				: speaker));
			setNotice("Speaker CRM saved.");
		} catch {
			setNotice("Network error");
		} finally {
			setPending(false);
		}
	}

	const selectedVisible = visible.filter((speaker) => selectedRecipients.includes(speaker.personId));
	const previewSpeaker = selectedVisible[0];
	const preview = previewSpeaker ? renderSpeakerAnnouncementPreview(emailSubject, emailBody, previewSpeaker, eventName, `${typeof window === "undefined" ? "" : window.location.origin}/portal`) : null;
	const crmSpeaker = crmSpeakerId ? speakers.find((speaker) => speaker.personId === crmSpeakerId) ?? null : null;

	return (
		<div className="mt-8 lg:grid lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-8">
			<aside className="mb-6 lg:mb-0">
				<label className="mb-2 block text-xs font-medium uppercase tracking-wide text-neutral-500 lg:hidden">
					Speakers section
					<select
						value={panel}
						onChange={(event) => setPanel(event.target.value as SpeakerPanel)}
						className={`mt-1.5 w-full ${INPUT_CLASSES}`}
					>
						{SPEAKER_PANELS.map((item) => (
							<option key={item.id} value={item.id}>
								{item.label}
							</option>
						))}
					</select>
				</label>
				<nav aria-label="Speaker sections" className="hidden lg:sticky lg:top-20 lg:block">
					<ul className="space-y-1 border-l border-neutral-800">
						{SPEAKER_PANELS.map((item) => {
							const selected = item.id === panel;
							return (
								<li key={item.id}>
									<button
										type="button"
										onClick={() => setPanel(item.id)}
										aria-current={selected ? "page" : undefined}
										className={
											selected
												? "-ml-px border-l-2 border-neutral-100 py-2 pl-4 text-left text-sm font-medium text-neutral-100"
												: "-ml-px border-l-2 border-transparent py-2 pl-4 text-left text-sm text-neutral-500 hover:border-neutral-600 hover:text-neutral-200"
										}
									>
										{item.label}
									</button>
								</li>
							);
						})}
					</ul>
				</nav>
			</aside>

			<div className="min-w-0 space-y-4">
				{notice ? (
					<p
						className={noticeClasses(
							notice.toLowerCase().includes("fail") || notice === "Network error"
								? "negative"
								: "positive",
						)}
					>
						{notice}
					</p>
				) : null}

				<header className="mb-2 border-b border-neutral-800 pb-4">
					<h2 className="text-lg font-semibold text-neutral-100">{activePanel.label}</h2>
					<p className="mt-1 text-sm text-neutral-400">{activePanel.description}</p>
				</header>

				{panel === "roster" ? (
					<div className="space-y-6">
						<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 lg:items-end">
							<label className="text-sm text-neutral-300 sm:col-span-2 lg:col-span-1">
								Search
								<input
									value={q}
									onChange={(event) => {
										setQ(event.target.value);
										syncUrl(status, event.target.value);
									}}
									placeholder="Name, email, company…"
									className={`mt-1 w-full ${INPUT_CLASSES}`}
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
									className={`mt-1 w-full ${INPUT_CLASSES}`}
								>
									<option value="all">All</option>
									{SPEAKER_WORKFLOW_STATUSES.map((value) => (
										<option key={value} value={value}>
											{value}
										</option>
									))}
								</select>
							</label>
							<label className="text-sm text-neutral-300">
								Email type
								<select
									value={emailTemplateKey}
									onChange={(event) =>
										setEmailTemplateKey(
											event.target.value as "task_reminder" | "speaker_announcement",
										)
									}
									className={`mt-1 w-full ${INPUT_CLASSES}`}
								>
									<option value="task_reminder">Task reminder</option>
									<option value="speaker_announcement">Announcement</option>
								</select>
							</label>
							<button
								type="button"
								disabled={
									pending ||
									selectedVisible.length === 0 ||
									(emailTemplateKey === "speaker_announcement" &&
										(!emailSubject.trim() || !emailBody.trim()))
								}
								onClick={() => void bulkEmail()}
								className={buttonClasses("secondary")}
							>
								Email selected ({selectedVisible.length})
							</button>
						</div>
						<p className="text-xs text-neutral-500">
							{emailTemplateKey === "speaker_announcement"
								? "Tokens: {{event_name}}, {{submitter_name}}, {{portal_url}}."
								: "Sends the outstanding-task reminder template to filtered speakers (all required pending tasks)."}{" "}
							<Link
								href={`/admin/events/${eventSlug}/tasks`}
								className="underline underline-offset-2 hover:text-neutral-300"
							>
								Open speaker tasks
							</Link>
						</p>
						{emailTemplateKey === "speaker_announcement" ? (
							<div className="grid gap-3">
								<label className="text-sm text-neutral-300">
									Subject
									<input
										value={emailSubject}
										onChange={(event) => setEmailSubject(event.target.value)}
										className={`mt-1 w-full ${INPUT_CLASSES}`}
									/>
								</label>
								<label className="text-sm text-neutral-300">
									Body
									<textarea
										value={emailBody}
										onChange={(event) => setEmailBody(event.target.value)}
										rows={5}
										className={`mt-1 w-full ${INPUT_CLASSES}`}
									/>
								</label>
								{previewSpeaker && preview ? (
									<div className="border-t border-neutral-800 pt-3 text-xs">
										<p className="font-medium text-neutral-200">
											Preview for {previewSpeaker.name}
										</p>
										<p className="mt-2 text-neutral-300">{preview.subject}</p>
										<p className="mt-2 whitespace-pre-wrap text-neutral-400">
											{preview.text}
										</p>
									</div>
								) : null}
							</div>
						) : null}

						{speakers.length === 0 ? (
							<EmptyState
								title="No speakers yet"
								description="Add a speaker to the roster, or wait for accepted submissions to populate it."
							>
								<p className="mt-4">
									<Link
										href={emptyNextActionHref(eventSlug, "speakers.add")}
										className={buttonClasses("primary")}
									>
										Add speaker
									</Link>
								</p>
							</EmptyState>
						) : visible.length === 0 ? (
							<p className="border-t border-neutral-800 py-8 text-sm text-neutral-500">
								No speakers match this filter.
							</p>
						) : (
							<ul className="divide-y divide-neutral-800 border-t border-neutral-800">
								{visible.map((speaker) => (
									<li key={speaker.personId} className="py-4 text-sm">
										<label className="mb-2 inline-flex items-center text-xs text-neutral-400">
											<input
												type="checkbox"
												className="mr-2"
												checked={selectedRecipients.includes(speaker.personId)}
												onChange={(event) =>
													setSelectedRecipients((current) =>
														event.target.checked
															? [...new Set([...current, speaker.personId])]
															: current.filter((id) => id !== speaker.personId),
													)
												}
											/>
											Email recipient
										</label>
										<div className="flex flex-wrap items-start justify-between gap-3">
											<div>
												<p className="font-medium text-neutral-100">
													{[speaker.salutation, speaker.name, speaker.honorific]
														.filter(Boolean)
														.join(" ")}
													{speaker.pronouns ? (
														<span className="font-normal text-neutral-500">
															{" "}
															({speaker.pronouns})
														</span>
													) : null}
													<span className="font-normal text-neutral-500">
														{" "}
														· {speaker.email}
													</span>
												</p>
												<p className="mt-1 text-neutral-400">
													{[speaker.jobTitle, speaker.company].filter(Boolean).join(" · ") ||
														"No title/company"}
													{speaker.submissionStatuses.length
														? ` · submissions: ${speaker.submissionStatuses.join(", ")}`
														: " · roster-only"}
												</p>
												{speaker.tasks.length > 0 ? (
													<p className="mt-1 text-xs text-neutral-500">
														{speaker.pendingTaskCount} pending task
														{speaker.pendingTaskCount === 1 ? "" : "s"}
														{speaker.earliestDueAt
															? ` · next due ${formatTaskDueAt(speaker.earliestDueAt)}`
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
												{speaker.crm.owner ||
												speaker.crm.tags.length > 0 ||
												speaker.crm.lastContactAt ? (
													<p className="mt-1 text-xs text-neutral-500">
														{speaker.crm.owner
															? `owner: ${speaker.crm.owner.name}`
															: "owner: unassigned"}
														{speaker.crm.tags.length > 0
															? ` · ${speaker.crm.tags.join(" · ")}`
															: ""}
														{speaker.crm.lastContactAt
															? ` · last contact ${new Date(speaker.crm.lastContactAt).toLocaleDateString()}`
															: ""}
													</p>
												) : null}
												{Object.keys(speaker.socials).length > 0 ? (
													<p className="mt-1 text-xs text-neutral-500">
														{SOCIAL_KEYS.filter((key) => speaker.socials[key]).map(
															(key) => (
																<span key={key} className="mr-3">
																	{key}: {speaker.socials[key]}
																</span>
															),
														)}
													</p>
												) : null}
												{speaker.bio ? (
													<p className="mt-2 max-w-3xl whitespace-pre-wrap text-xs text-neutral-400">
														{speaker.bio}
													</p>
												) : null}
												{speaker.logisticsText ? (
													<p className="mt-2 text-xs text-neutral-500">
														Travel / logistics: {speaker.logisticsText}
													</p>
												) : null}
												{speaker.headshot ? (
													<div className="mt-2 flex items-center gap-3">
														<Image
															unoptimized
															width={56}
															height={56}
															src={`/api/admin/events/${eventSlug}/speakers/${speaker.personId}/headshot`}
															alt={`${speaker.name} headshot`}
															className="h-14 w-14 rounded-lg object-cover"
														/>
														<a
															className="text-xs underline"
															href={`/api/admin/events/${eventSlug}/speakers/${speaker.personId}/headshot`}
														>
															{speaker.headshot.filename ?? "View headshot"} · uploaded{" "}
															{new Date(speaker.headshot.uploadedAt).toLocaleString()}
														</a>
													</div>
												) : null}
											</div>
											<div className="flex flex-wrap items-center gap-2">
												<StatusPill tone={workflowTone(speaker.workflowStatus)}>
													{speaker.workflowStatus}
												</StatusPill>
												<button
													type="button"
													disabled={pending}
													onClick={() => edit(speaker)}
													className={buttonClasses("secondary")}
												>
													Edit
												</button>
												<button
													type="button"
													disabled={pending}
													onClick={() => void openCrm(speaker)}
													className={buttonClasses("secondary")}
												>
													CRM
												</button>
												<button
													type="button"
													disabled={pending}
													onClick={() => void invite(speaker.personId)}
													className={buttonClasses("secondary")}
												>
													Send portal invite
												</button>
												<button
													type="button"
													disabled={pending}
													onClick={() => void copyPortalSignInLink(speaker.personId)}
													className={buttonClasses("secondary")}
												>
													Copy portal sign-in link
												</button>
											</div>
										</div>
									</li>
								))}
							</ul>
						)}
					</div>
				) : null}

				{panel === "add" ? (
					<div className="space-y-4">
						<div className="flex flex-wrap items-baseline justify-between gap-2">
							<p className="text-sm text-neutral-400">
								{draft.personId
									? "Editing an existing roster entry."
									: "Add someone who is not coming in through a submission."}
							</p>
							{draft.personId ? (
								<button
									type="button"
									className="text-xs text-neutral-400 underline underline-offset-2"
									onClick={() => setDraft(emptyDraft())}
								>
									Clear form
								</button>
							) : null}
						</div>
						<div className="grid gap-4 md:grid-cols-2">
							<label className="text-sm text-neutral-300">
								Name
								<input
									value={draft.name}
									onChange={(event) => setDraft({ ...draft, name: event.target.value })}
									className={`mt-1 w-full ${INPUT_CLASSES}`}
								/>
							</label>
							<label className="text-sm text-neutral-300">
								Email
								<input
									value={draft.email}
									onChange={(event) => setDraft({ ...draft, email: event.target.value })}
									className={`mt-1 w-full ${INPUT_CLASSES}`}
								/>
							</label>
							<label className="text-sm text-neutral-300">
								Job title
								<input
									value={draft.jobTitle}
									onChange={(event) => setDraft({ ...draft, jobTitle: event.target.value })}
									className={`mt-1 w-full ${INPUT_CLASSES}`}
								/>
							</label>
							<label className="text-sm text-neutral-300">
								Company
								<input
									value={draft.company}
									onChange={(event) => setDraft({ ...draft, company: event.target.value })}
									className={`mt-1 w-full ${INPUT_CLASSES}`}
								/>
							</label>
							<label className="text-sm text-neutral-300 md:col-span-2">
								Bio
								<textarea
									rows={5}
									maxLength={10000}
									value={draft.bio}
									onChange={(event) => setDraft({ ...draft, bio: event.target.value })}
									className={`mt-1 w-full ${INPUT_CLASSES}`}
								/>
							</label>
							<label className="text-sm text-neutral-300 md:col-span-2">
								Travel and logistics
								<textarea
									rows={3}
									maxLength={4000}
									value={draft.logisticsText}
									onChange={(event) =>
										setDraft({ ...draft, logisticsText: event.target.value })
									}
									className={`mt-1 w-full ${INPUT_CLASSES}`}
								/>
							</label>
							<label className="text-sm text-neutral-300">
								Workflow status
								<select
									value={draft.workflowStatus}
									onChange={(event) =>
										setDraft({
											...draft,
											workflowStatus: event.target.value as SpeakerWorkflowStatus,
										})
									}
									className={`mt-1 w-full ${INPUT_CLASSES}`}
								>
									{SPEAKER_WORKFLOW_STATUSES.map((value) => (
										<option key={value} value={value}>
											{value}
										</option>
									))}
								</select>
							</label>
							{SOCIAL_KEYS.map((key) => (
								<label key={key} className="text-sm text-neutral-300">
									{key}
									<input
										value={draft.socials[key] ?? ""}
										onChange={(event) =>
											setDraft({
												...draft,
												socials: { ...draft.socials, [key]: event.target.value },
											})
										}
										className={`mt-1 w-full ${INPUT_CLASSES}`}
									/>
								</label>
							))}
						</div>
						<button
							type="button"
							disabled={pending || !draft.name.trim() || !draft.email.trim()}
							onClick={() => void saveSpeaker()}
							className={buttonClasses("primary")}
						>
							{pending ? "Saving…" : draft.personId ? "Save changes" : "Add to roster"}
						</button>
					</div>
				) : null}

				{panel === "import" ? (
					<div className="space-y-4">
						<p className="text-sm text-neutral-400">
							Columns: email, name, job_title, company, bio, logistics, workflow_status,
							twitter, linkedin, github, website, facebook.
						</p>
						<textarea
							aria-label="Speaker CSV"
							value={csv}
							onChange={(event) => setCsv(event.target.value)}
							rows={8}
							className={`w-full font-mono text-xs ${INPUT_CLASSES}`}
						/>
						<button
							type="button"
							disabled={pending || csv.trim().length === 0}
							onClick={() => void importCsv()}
							className={buttonClasses("secondary")}
						>
							Import speakers
						</button>
					</div>
				) : null}

				{panel === "content-sessions" ? (
					<ContentConsole
						eventSlug={eventSlug}
						sessions={contentSessions}
						speakers={contentSpeakers}
						view="sessions"
					/>
				) : null}

				{panel === "content-speakers" ? (
					<ContentConsole
						eventSlug={eventSlug}
						sessions={contentSessions}
						speakers={contentSpeakers}
						view="speakers"
					/>
				) : null}
			</div>

			{crmSpeaker ? (
				<section
					aria-label={`Speaker CRM for ${crmSpeaker.name}`}
					className="fixed inset-y-0 right-0 z-50 w-full max-w-xl overflow-y-auto border-l border-neutral-800 bg-neutral-900 p-6 shadow-2xl shadow-black/40"
				>
					<div className="flex flex-wrap items-baseline justify-between gap-2">
						<div>
							<h2 className="font-medium text-neutral-100">
								Speaker CRM · {crmSpeaker.name}
							</h2>
							<p className="mt-1 text-sm text-neutral-400">
								Private organizer context. Email deliveries and completed tasks appear below
								automatically.
							</p>
						</div>
						<button
							type="button"
							className="text-xs text-neutral-400 underline underline-offset-2"
							onClick={() => {
								setCrmSpeakerId(null);
								setCrmDetail(null);
							}}
						>
							Close
						</button>
					</div>
					{crmDetail ? (
						<div className="mt-4 grid gap-3 md:grid-cols-2">
							<label className="text-sm text-neutral-300">
								Owner
								<select
									value={crmOwnerAccountId}
									onChange={(event) => setCrmOwnerAccountId(event.target.value)}
									className={`mt-1 w-full ${INPUT_CLASSES}`}
								>
									<option value="">Unassigned</option>
									{crmOwners.map((owner) => (
										<option key={owner.accountId} value={owner.accountId}>
											{owner.name} · {owner.email}
										</option>
									))}
								</select>
							</label>
							<label className="text-sm text-neutral-300">
								Tags
								<input
									value={crmTags}
									onChange={(event) => setCrmTags(event.target.value)}
									placeholder="VIP, travel, green room"
									className={`mt-1 w-full ${INPUT_CLASSES}`}
								/>
							</label>
							<label className="text-sm text-neutral-300 md:col-span-2">
								Internal note
								<textarea
									value={crmNote}
									onChange={(event) => setCrmNote(event.target.value)}
									rows={3}
									maxLength={4000}
									placeholder="Private organizer note"
									className={`mt-1 w-full ${INPUT_CLASSES}`}
								/>
							</label>
							<label className="text-sm text-neutral-300 md:col-span-2">
								Log contact
								<textarea
									value={crmContactNote}
									onChange={(event) => setCrmContactNote(event.target.value)}
									rows={2}
									maxLength={4000}
									placeholder="What happened in the last call or message?"
									className={`mt-1 w-full ${INPUT_CLASSES}`}
								/>
							</label>
							<div className="md:col-span-2">
								<button
									type="button"
									disabled={pending}
									onClick={() => void saveCrm()}
									className={buttonClasses("primary")}
								>
									{pending ? "Saving…" : "Save CRM"}
								</button>
								{crmDetail.lastContactAt ? (
									<span className="ml-3 text-xs text-neutral-500">
										Last contact: {new Date(crmDetail.lastContactAt).toLocaleString()}
									</span>
								) : (
									<span className="ml-3 text-xs text-neutral-500">No contact recorded yet</span>
								)}
							</div>
							<div className="md:col-span-2">
								<h3 className="text-sm font-medium text-neutral-200">Timeline</h3>
								{crmDetail.timeline.length ? (
									<ul className="mt-2 divide-y divide-neutral-800 border-t border-neutral-800">
										{crmDetail.timeline.map((entry) => (
											<li key={`${entry.kind}-${entry.id}`} className="py-2 text-sm">
												<p className="text-neutral-200">{entry.body}</p>
												<p className="mt-1 text-xs text-neutral-500">
													{entry.kind.replace("_", " ")} ·{" "}
													{new Date(entry.occurredAt).toLocaleString()}
													{entry.authorName ? ` · ${entry.authorName}` : ""}
												</p>
											</li>
										))}
									</ul>
								) : (
									<p className="mt-2 text-sm text-neutral-500">
										No CRM activity, delivered email, or completed task yet.
									</p>
								)}
							</div>
						</div>
					) : (
						<p className="mt-4 text-sm text-neutral-500">Loading CRM history…</p>
					)}
				</section>
			) : null}
		</div>
	);
}
