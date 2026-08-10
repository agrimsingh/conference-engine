"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { buttonClasses, INPUT_CLASSES, noticeClasses, StatusPill } from "@/components/ui";
import {
	CONTACT_PIPELINE_STAGES,
	PIPELINE_STAGE_LABELS,
	type AccountContact,
	type ContactDetail,
	type ContactFilters,
	type ContactKpis,
	type ContactPipelineStage,
	type ContactSegment,
	type PipelineBoard,
} from "@/lib/contacts";

type EventOption = { id: string; slug: string; name: string };

type Props = {
	initialContacts: AccountContact[];
	initialFilters: ContactFilters;
	initialOptions: { companies: string[]; titles: string[]; tags: string[] };
	initialKpis: ContactKpis;
	initialBoard: PipelineBoard;
	initialSegments: ContactSegment[];
	events: EventOption[];
	initialView: "directory" | "pipeline";
	initialSegmentId: string | null;
};

type CreateDraft = {
	name: string;
	email: string;
	title: string;
	company: string;
	bio: string;
};

const emptyDraft = (): CreateDraft => ({
	name: "",
	email: "",
	title: "",
	company: "",
	bio: "",
});

export function ContactsConsole({
	initialContacts,
	initialFilters,
	initialOptions,
	initialKpis,
	initialBoard,
	initialSegments,
	events,
	initialView,
	initialSegmentId,
}: Props) {
	const router = useRouter();
	const [pending, startTransition] = useTransition();
	const [view, setView] = useState<"directory" | "pipeline">(initialView);
	const [contacts, setContacts] = useState(initialContacts);
	const [board, setBoard] = useState(initialBoard);
	const [kpis, setKpis] = useState(initialKpis);
	const [options, setOptions] = useState(initialOptions);
	const [segments, setSegments] = useState(initialSegments);
	const [filters, setFilters] = useState<ContactFilters>(initialFilters);
	const [selected, setSelected] = useState<Set<string>>(new Set());
	const [message, setMessage] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [csvText, setCsvText] = useState("");
	const [draft, setDraft] = useState<CreateDraft>(emptyDraft);
	const [segmentName, setSegmentName] = useState("AI Experts");
	const [activeSegmentId, setActiveSegmentId] = useState<string | null>(initialSegmentId);
	const [profile, setProfile] = useState<ContactDetail | null>(null);
	const [profileNote, setProfileNote] = useState("");
	const [profileTag, setProfileTag] = useState("");
	const [mergeSecondaryId, setMergeSecondaryId] = useState<string | null>(null);
	const [duplicates, setDuplicates] = useState<AccountContact[]>([]);
	const [enrollContactId, setEnrollContactId] = useState("");
	const [emailSubject, setEmailSubject] = useState("Speak at {{event}}?");
	const [emailBody, setEmailBody] = useState(
		"Hi {{first_name}},\n\nWe'd love you to speak. Reply if you're interested.\n",
	);
	const [emailEventId, setEmailEventId] = useState(events[0]?.id ?? "");
	const [pushEventId, setPushEventId] = useState(events[0]?.id ?? "");

	const selectedContacts = useMemo(
		() => contacts.filter((contact) => selected.has(contact.id)),
		[contacts, selected],
	);

	async function refreshDirectory(nextFilters: ContactFilters = filters) {
		const params = new URLSearchParams();
		if (nextFilters.q) params.set("q", nextFilters.q);
		if (nextFilters.company) params.set("company", nextFilters.company);
		if (nextFilters.title) params.set("title", nextFilters.title);
		if (nextFilters.tag) params.set("tag", nextFilters.tag);
		if (nextFilters.stage && nextFilters.stage !== "all") params.set("stage", nextFilters.stage);
		const response = await fetch(`/api/admin/contacts?${params.toString()}`);
		const data = (await response.json()) as {
			ok: boolean;
			error?: string;
			contacts?: AccountContact[];
			options?: Props["initialOptions"];
			kpis?: ContactKpis;
		};
		if (!data.ok) throw new Error(data.error ?? "Failed to load contacts");
		setContacts(data.contacts ?? []);
		if (data.options) setOptions(data.options);
		if (data.kpis) setKpis(data.kpis);
	}

	async function refreshPipeline() {
		const response = await fetch("/api/admin/contacts/pipeline");
		const data = (await response.json()) as { ok: boolean; board?: PipelineBoard; error?: string };
		if (!data.ok || !data.board) throw new Error(data.error ?? "Failed to load pipeline");
		setBoard(data.board);
	}

	function run(action: () => Promise<void>) {
		setError(null);
		setMessage(null);
		startTransition(() => {
			void action().catch((err: unknown) => {
				setError(err instanceof Error ? err.message : "Something went wrong");
			});
		});
	}

	function toggleSelected(id: string) {
		setSelected((prev) => {
			const next = new Set(prev);
			if (next.has(id)) next.delete(id);
			else next.add(id);
			return next;
		});
	}

	function clearFilters() {
		const cleared: ContactFilters = { stage: "all" };
		setFilters(cleared);
		setActiveSegmentId(null);
		run(async () => {
			await refreshDirectory(cleared);
			setMessage("Filters cleared");
			router.replace("/admin/contacts");
		});
	}

	async function openProfile(contactId: string) {
		const response = await fetch(`/api/admin/contacts/${contactId}`);
		const data = (await response.json()) as {
			ok: boolean;
			contact?: ContactDetail;
			duplicates?: AccountContact[];
			error?: string;
		};
		if (!data.ok || !data.contact) throw new Error(data.error ?? "Contact not found");
		setProfile(data.contact);
		setDuplicates(data.duplicates ?? []);
		setMergeSecondaryId(data.duplicates?.[0]?.id ?? null);
		setProfileNote("");
		setProfileTag("");
	}

	return (
		<div className="space-y-6">
			<section className="grid gap-3 sm:grid-cols-4">
				<KpiCard label="Contacts" value={String(kpis.totalContacts)} />
				<KpiCard label="In pipeline" value={String(kpis.inPipeline)} />
				<KpiCard label="Confirmed" value={String(kpis.confirmed)} />
				<div className="rounded-lg border border-neutral-800 bg-neutral-900/60 px-4 py-3">
					<p className="text-xs uppercase tracking-wide text-neutral-500">Top companies</p>
					{kpis.topCompanies.length === 0 ? (
						<p className="mt-2 text-sm text-neutral-400">No company data yet</p>
					) : (
						<ul className="mt-2 space-y-1 text-sm text-neutral-200">
							{kpis.topCompanies.map((row) => (
								<li key={row.company}>
									<button
										type="button"
										className="hover:underline"
										onClick={() => {
											const next = { ...filters, company: row.company };
											setFilters(next);
											run(async () => {
												await refreshDirectory(next);
												setView("directory");
											});
										}}
									>
										{row.company}{" "}
										<span className="text-neutral-500">({row.count})</span>
									</button>
								</li>
							))}
						</ul>
					)}
				</div>
			</section>

			<div className="flex flex-wrap items-center gap-2">
				<button
					type="button"
					className={buttonClasses(view === "directory" ? "primary" : "secondary", "sm")}
					onClick={() => setView("directory")}
				>
					Directory
				</button>
				<button
					type="button"
					className={buttonClasses(view === "pipeline" ? "primary" : "secondary", "sm")}
					onClick={() => {
						setView("pipeline");
						run(refreshPipeline);
					}}
				>
					Pipeline
				</button>
				<span className="ml-auto text-xs text-neutral-500">
					{pending ? "Working…" : `${contacts.length} shown`}
				</span>
			</div>

			{error ? <p className={noticeClasses("negative")}>{error}</p> : null}
			{message ? <p className={noticeClasses("positive")}>{message}</p> : null}

			{view === "directory" ? (
				<>
					<section className="space-y-3 rounded-lg border border-neutral-800 bg-neutral-950/40 p-4">
						<div className="grid gap-3 md:grid-cols-4">
							<label className="block text-sm md:col-span-2">
								<span className="mb-1 block text-neutral-400">Search</span>
								<input
									className={INPUT_CLASSES}
									value={filters.q ?? ""}
									placeholder="Name, email, company…"
									onChange={(event) => setFilters((prev) => ({ ...prev, q: event.target.value }))}
									onKeyDown={(event) => {
										if (event.key === "Enter") {
											run(async () => {
												await refreshDirectory(filters);
											});
										}
									}}
								/>
							</label>
							<label className="block text-sm">
								<span className="mb-1 block text-neutral-400">Company</span>
								<select
									className={INPUT_CLASSES}
									value={filters.company ?? ""}
									onChange={(event) => {
										const next = { ...filters, company: event.target.value || undefined };
										setFilters(next);
										run(async () => refreshDirectory(next));
									}}
								>
									<option value="">Any company</option>
									{options.companies.map((company) => (
										<option key={company} value={company}>
											{company}
										</option>
									))}
								</select>
							</label>
							<label className="block text-sm">
								<span className="mb-1 block text-neutral-400">Title</span>
								<select
									className={INPUT_CLASSES}
									value={filters.title ?? ""}
									onChange={(event) => {
										const next = { ...filters, title: event.target.value || undefined };
										setFilters(next);
										run(async () => refreshDirectory(next));
									}}
								>
									<option value="">Any title</option>
									{options.titles.map((title) => (
										<option key={title} value={title}>
											{title}
										</option>
									))}
								</select>
							</label>
							<label className="block text-sm">
								<span className="mb-1 block text-neutral-400">Tag</span>
								<select
									className={INPUT_CLASSES}
									value={filters.tag ?? ""}
									onChange={(event) => {
										const next = { ...filters, tag: event.target.value || undefined };
										setFilters(next);
										run(async () => refreshDirectory(next));
									}}
								>
									<option value="">Any tag</option>
									{options.tags.map((tag) => (
										<option key={tag} value={tag}>
											{tag}
										</option>
									))}
								</select>
							</label>
						</div>
						<div className="flex flex-wrap gap-2">
							<button
								type="button"
								className={buttonClasses("primary", "sm")}
								onClick={() => run(async () => refreshDirectory(filters))}
							>
								Apply search
							</button>
							<button type="button" className={buttonClasses("secondary", "sm")} onClick={clearFilters}>
								Clear filters
							</button>
							{(filters.company || filters.title || filters.tag || filters.q) && (
								<div className="flex flex-wrap items-center gap-2 text-xs text-neutral-400">
									{filters.q ? <StatusPill>q: {filters.q}</StatusPill> : null}
									{filters.company ? <StatusPill>company: {filters.company}</StatusPill> : null}
									{filters.title ? <StatusPill>title: {filters.title}</StatusPill> : null}
									{filters.tag ? <StatusPill>tag: {filters.tag}</StatusPill> : null}
								</div>
							)}
						</div>
						<div className="flex flex-wrap items-end gap-2 border-t border-neutral-800 pt-3">
							<label className="block text-sm">
								<span className="mb-1 block text-neutral-400">Save segment</span>
								<input
									className={INPUT_CLASSES}
									value={segmentName}
									onChange={(event) => setSegmentName(event.target.value)}
								/>
							</label>
							<button
								type="button"
								className={buttonClasses("secondary", "sm")}
								onClick={() =>
									run(async () => {
										const response = await fetch("/api/admin/contacts/segments", {
											method: "POST",
											headers: { "content-type": "application/json" },
											body: JSON.stringify({ name: segmentName, filters }),
										});
										const data = (await response.json()) as {
											ok: boolean;
											segment?: ContactSegment;
											error?: string;
										};
										if (!data.ok || !data.segment) throw new Error(data.error ?? "Could not save segment");
										setSegments((prev) => [...prev, data.segment!].sort((a, b) => a.name.localeCompare(b.name)));
										setActiveSegmentId(data.segment.id);
										setMessage(`Saved segment “${data.segment.name}”`);
									})
								}
							>
								Save segment
							</button>
							{segments.length > 0 ? (
								<label className="block text-sm">
									<span className="mb-1 block text-neutral-400">Open segment</span>
									<select
										className={INPUT_CLASSES}
										value={activeSegmentId ?? ""}
										onChange={(event) => {
											const id = event.target.value || null;
											setActiveSegmentId(id);
											if (!id) return;
											run(async () => {
												const response = await fetch(`/api/admin/contacts/segments?id=${id}`);
												const data = (await response.json()) as {
													ok: boolean;
													segment?: ContactSegment;
													contacts?: AccountContact[];
													error?: string;
												};
												if (!data.ok || !data.segment) throw new Error(data.error ?? "Segment not found");
												setFilters(data.segment.filters);
												setContacts(data.contacts ?? []);
												setMessage(`Opened segment “${data.segment.name}” (${data.contacts?.length ?? 0})`);
											});
										}}
									>
										<option value="">Choose…</option>
										{segments.map((segment) => (
											<option key={segment.id} value={segment.id}>
												{segment.name}
											</option>
										))}
									</select>
								</label>
							) : null}
						</div>
					</section>

					<section className="overflow-x-auto rounded-lg border border-neutral-800">
						<table className="min-w-full text-left text-sm">
							<thead className="bg-neutral-900 text-xs uppercase tracking-wide text-neutral-500">
								<tr>
									<th className="px-3 py-2">
										<span className="sr-only">Select</span>
									</th>
									<th className="px-3 py-2">Name</th>
									<th className="px-3 py-2">Email</th>
									<th className="px-3 py-2">Title</th>
									<th className="px-3 py-2">Company</th>
									<th className="px-3 py-2">Tags</th>
									<th className="px-3 py-2">Stage</th>
								</tr>
							</thead>
							<tbody className="divide-y divide-neutral-900">
								{contacts.length === 0 ? (
									<tr>
										<td colSpan={7} className="px-3 py-8 text-center text-neutral-500">
											No contacts yet. Import a CSV or add one below.
										</td>
									</tr>
								) : (
									contacts.map((contact) => (
										<tr key={contact.id} className="hover:bg-neutral-900/50">
											<td className="px-3 py-2">
												<input
													type="checkbox"
													checked={selected.has(contact.id)}
													onChange={() => toggleSelected(contact.id)}
													aria-label={`Select ${contact.name}`}
												/>
											</td>
											<td className="px-3 py-2">
												<button
													type="button"
													className="font-medium text-neutral-100 hover:underline"
													onClick={() => run(async () => openProfile(contact.id))}
												>
													{contact.name}
												</button>
											</td>
											<td className="px-3 py-2 text-neutral-300">{contact.email}</td>
											<td className="px-3 py-2 text-neutral-400">{contact.title ?? "—"}</td>
											<td className="px-3 py-2 text-neutral-400">{contact.company ?? "—"}</td>
											<td className="px-3 py-2">
												<div className="flex flex-wrap gap-1">
													{contact.tags.map((tag) => (
														<StatusPill key={tag}>{tag}</StatusPill>
													))}
												</div>
											</td>
											<td className="px-3 py-2 text-neutral-400">
												{contact.stage ? PIPELINE_STAGE_LABELS[contact.stage] : "—"}
											</td>
										</tr>
									))
								)}
							</tbody>
						</table>
					</section>

					<section className="grid gap-4 lg:grid-cols-2">
						<div className="space-y-3 rounded-lg border border-neutral-800 p-4">
							<h2 className="text-sm font-medium text-neutral-200">Import CSV</h2>
							<p className="text-xs text-neutral-500">
								Columns: name, email, title, company, bio. Re-import dedupes on email.
							</p>
							<textarea
								className={`${INPUT_CLASSES} min-h-28 font-mono text-xs`}
								value={csvText}
								onChange={(event) => setCsvText(event.target.value)}
								placeholder={"name,email,title,company,bio\nPriya Raman,priya@…,…"}
							/>
							<button
								type="button"
								className={buttonClasses("primary", "sm")}
								onClick={() =>
									run(async () => {
										const response = await fetch("/api/admin/contacts/import", {
											method: "POST",
											headers: { "content-type": "application/json" },
											body: JSON.stringify({ csv: csvText }),
										});
										const data = (await response.json()) as {
											ok: boolean;
											imported?: number;
											updated?: number;
											error?: string;
										};
										if (!data.ok) throw new Error(data.error ?? "Import failed");
										await refreshDirectory(filters);
										await refreshPipeline();
										setMessage(`Imported ${data.imported ?? 0}, updated ${data.updated ?? 0}`);
									})
								}
							>
								Import contacts
							</button>
						</div>

						<div className="space-y-3 rounded-lg border border-neutral-800 p-4">
							<h2 className="text-sm font-medium text-neutral-200">Add contact</h2>
							<div className="grid gap-2 sm:grid-cols-2">
								<input
									className={INPUT_CLASSES}
									placeholder="Name"
									value={draft.name}
									onChange={(event) => setDraft((prev) => ({ ...prev, name: event.target.value }))}
								/>
								<input
									className={INPUT_CLASSES}
									placeholder="Email"
									value={draft.email}
									onChange={(event) => setDraft((prev) => ({ ...prev, email: event.target.value }))}
								/>
								<input
									className={INPUT_CLASSES}
									placeholder="Title"
									value={draft.title}
									onChange={(event) => setDraft((prev) => ({ ...prev, title: event.target.value }))}
								/>
								<input
									className={INPUT_CLASSES}
									placeholder="Company"
									value={draft.company}
									onChange={(event) => setDraft((prev) => ({ ...prev, company: event.target.value }))}
								/>
							</div>
							<textarea
								className={`${INPUT_CLASSES} min-h-20`}
								placeholder="Bio"
								value={draft.bio}
								onChange={(event) => setDraft((prev) => ({ ...prev, bio: event.target.value }))}
							/>
							<button
								type="button"
								className={buttonClasses("secondary", "sm")}
								onClick={() =>
									run(async () => {
										const response = await fetch("/api/admin/contacts", {
											method: "POST",
											headers: { "content-type": "application/json" },
											body: JSON.stringify(draft),
										});
										const data = (await response.json()) as {
											ok: boolean;
											contact?: AccountContact;
											error?: string;
										};
										if (!data.ok) throw new Error(data.error ?? "Could not create contact");
										setDraft(emptyDraft());
										await refreshDirectory(filters);
										setMessage(`Created ${data.contact?.name ?? "contact"}`);
										if (data.contact) await openProfile(data.contact.id);
									})
								}
							>
								Create contact
							</button>
						</div>
					</section>

					<section className="space-y-3 rounded-lg border border-neutral-800 p-4">
						<h2 className="text-sm font-medium text-neutral-200">
							Bulk email ({selectedContacts.length} selected)
						</h2>
						<div className="grid gap-3 md:grid-cols-2">
							<label className="block text-sm">
								<span className="mb-1 block text-neutral-400">Log against event</span>
								<select
									className={INPUT_CLASSES}
									value={emailEventId}
									onChange={(event) => setEmailEventId(event.target.value)}
								>
									{events.map((event) => (
										<option key={event.id} value={event.id}>
											{event.name}
										</option>
									))}
								</select>
							</label>
							<label className="block text-sm">
								<span className="mb-1 block text-neutral-400">Subject</span>
								<input
									className={INPUT_CLASSES}
									value={emailSubject}
									onChange={(event) => setEmailSubject(event.target.value)}
								/>
							</label>
						</div>
						<textarea
							className={`${INPUT_CLASSES} min-h-28`}
							value={emailBody}
							onChange={(event) => setEmailBody(event.target.value)}
						/>
						<p className="text-xs text-neutral-500">
							Merge fields: {"{{first_name}}"}, {"{{name}}"}, {"{{company}}"}.
						</p>
						<button
							type="button"
							className={buttonClasses("primary", "sm")}
							disabled={selectedContacts.length === 0 || !emailEventId}
							onClick={() =>
								run(async () => {
									const response = await fetch("/api/admin/contacts/bulk-email", {
										method: "POST",
										headers: { "content-type": "application/json" },
										body: JSON.stringify({
											contactIds: [...selected],
											eventId: emailEventId,
											subject: emailSubject,
											text: emailBody,
										}),
									});
									const data = (await response.json()) as {
										ok: boolean;
										sent?: number;
										skipped?: number;
										error?: string;
									};
									if (!data.ok) throw new Error(data.error ?? "Send failed");
									setMessage(`Sent ${data.sent ?? 0}, skipped ${data.skipped ?? 0}`);
								})
							}
						>
							Send email
						</button>
					</section>
				</>
			) : (
				<section className="space-y-4">
					<div className="flex flex-wrap items-end gap-2 rounded-lg border border-neutral-800 p-4">
						<label className="block text-sm">
							<span className="mb-1 block text-neutral-400">Enroll contact</span>
							<select
								className={INPUT_CLASSES}
								value={enrollContactId}
								onChange={(event) => setEnrollContactId(event.target.value)}
							>
								<option value="">Choose…</option>
								{contacts.map((contact) => (
									<option key={contact.id} value={contact.id}>
										{contact.name}
									</option>
								))}
							</select>
						</label>
						<button
							type="button"
							className={buttonClasses("primary", "sm")}
							disabled={!enrollContactId}
							onClick={() =>
								run(async () => {
									const response = await fetch("/api/admin/contacts/pipeline", {
										method: "PATCH",
										headers: { "content-type": "application/json" },
										body: JSON.stringify({
											contactId: enrollContactId,
											stage: "research",
											enroll: true,
										}),
									});
									const data = (await response.json()) as {
										ok: boolean;
										board?: PipelineBoard;
										error?: string;
									};
									if (!data.ok || !data.board) throw new Error(data.error ?? "Enroll failed");
									setBoard(data.board);
									setMessage("Enrolled in Research");
									await refreshDirectory(filters);
								})
							}
						>
							+ Enroll
						</button>
					</div>
					<div className="grid gap-3 xl:grid-cols-5">
						{CONTACT_PIPELINE_STAGES.map((stage) => (
							<div key={stage} className="rounded-lg border border-neutral-800 bg-neutral-950/50">
								<div className="border-b border-neutral-800 px-3 py-2 text-xs font-medium uppercase tracking-wide text-neutral-400">
									{PIPELINE_STAGE_LABELS[stage]} ({board[stage].length})
								</div>
								<ul className="space-y-2 p-2">
									{board[stage].map((contact) => (
										<li
											key={contact.id}
											className="rounded-md border border-neutral-800 bg-neutral-900 px-2 py-2 text-sm"
										>
											<button
												type="button"
												className="block w-full text-left font-medium text-neutral-100 hover:underline"
												onClick={() => run(async () => openProfile(contact.id))}
											>
												{contact.name}
											</button>
											<p className="truncate text-xs text-neutral-500">{contact.company ?? contact.email}</p>
											<label className="mt-2 block text-[11px] text-neutral-500">
												Move to
												<select
													className={`${INPUT_CLASSES} mt-1 text-xs`}
													value={stage}
													onChange={(event) => {
														const toStage = event.target.value as ContactPipelineStage;
														run(async () => {
															const response = await fetch("/api/admin/contacts/pipeline", {
																method: "PATCH",
																headers: { "content-type": "application/json" },
																body: JSON.stringify({
																	contactId: contact.id,
																	stage: toStage,
																}),
															});
															const data = (await response.json()) as {
																ok: boolean;
																board?: PipelineBoard;
																error?: string;
															};
															if (!data.ok || !data.board) {
																throw new Error(data.error ?? "Move failed");
															}
															setBoard(data.board);
															await refreshDirectory(filters);
														});
													}}
												>
													{CONTACT_PIPELINE_STAGES.map((option) => (
														<option key={option} value={option}>
															{PIPELINE_STAGE_LABELS[option]}
														</option>
													))}
												</select>
											</label>
										</li>
									))}
								</ul>
							</div>
						))}
					</div>
				</section>
			)}

			{profile ? (
				<div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 p-4">
					<div className="my-8 w-full max-w-2xl rounded-lg border border-neutral-700 bg-neutral-950 p-5 shadow-xl">
						<div className="flex items-start justify-between gap-3">
							<div>
								<h2 className="text-xl font-semibold text-neutral-100">{profile.name}</h2>
								<p className="text-sm text-neutral-400">{profile.email}</p>
								<p className="mt-1 text-sm text-neutral-500">
									{[profile.title, profile.company].filter(Boolean).join(" · ") || "No title/company"}
								</p>
							</div>
							<button
								type="button"
								className={buttonClasses("secondary", "sm")}
								onClick={() => setProfile(null)}
							>
								Close
							</button>
						</div>

						{profile.bio ? (
							<p className="mt-4 text-sm leading-6 text-neutral-300">{profile.bio}</p>
						) : null}

						<div className="mt-4 flex flex-wrap gap-1">
							{profile.tags.map((tag) => (
								<StatusPill key={tag}>{tag}</StatusPill>
							))}
						</div>

						<div className="mt-4 grid gap-2 sm:grid-cols-[1fr_auto]">
							<input
								className={INPUT_CLASSES}
								placeholder="Add tag (e.g. AI)"
								value={profileTag}
								onChange={(event) => setProfileTag(event.target.value)}
							/>
							<button
								type="button"
								className={buttonClasses("secondary", "sm")}
								onClick={() =>
									run(async () => {
										const tags = [...new Set([...profile.tags, profileTag.trim()].filter(Boolean))];
										const response = await fetch(`/api/admin/contacts/${profile.id}`, {
											method: "PATCH",
											headers: { "content-type": "application/json" },
											body: JSON.stringify({ tags }),
										});
										const data = (await response.json()) as {
											ok: boolean;
											contact?: ContactDetail;
											error?: string;
										};
										if (!data.ok || !data.contact) throw new Error(data.error ?? "Could not save tag");
										setProfile(data.contact);
										setProfileTag("");
										await refreshDirectory(filters);
										setMessage("Tag saved");
									})
								}
							>
								Save tag
							</button>
						</div>

						<div className="mt-4 space-y-2">
							<label className="block text-sm text-neutral-400">Internal note</label>
							<textarea
								className={`${INPUT_CLASSES} min-h-24`}
								value={profileNote}
								onChange={(event) => setProfileNote(event.target.value)}
								placeholder="Met at DevFlow 2026…"
							/>
							<button
								type="button"
								className={buttonClasses("primary", "sm")}
								onClick={() =>
									run(async () => {
										const response = await fetch(`/api/admin/contacts/${profile.id}`, {
											method: "PATCH",
											headers: { "content-type": "application/json" },
											body: JSON.stringify({ note: profileNote }),
										});
										const data = (await response.json()) as {
											ok: boolean;
											contact?: ContactDetail;
											error?: string;
										};
										if (!data.ok || !data.contact) throw new Error(data.error ?? "Could not save note");
										setProfile(data.contact);
										setProfileNote("");
										setMessage("Note saved");
									})
								}
							>
								Save note
							</button>
						</div>

						<div className="mt-6 grid gap-4 sm:grid-cols-2">
							<div>
								<h3 className="text-xs font-medium uppercase tracking-wide text-neutral-500">
									Event history
								</h3>
								{profile.eventLinks.length === 0 ? (
									<p className="mt-2 text-sm text-neutral-500">No linked events yet.</p>
								) : (
									<ul className="mt-2 space-y-1 text-sm">
										{profile.eventLinks.map((link) => (
											<li key={`${link.eventId}-${link.personId}`}>
												<Link
													href={`/admin/events/${link.eventSlug}/speakers`}
													className="text-emerald-400 hover:underline"
												>
													{link.eventName}
												</Link>
											</li>
										))}
									</ul>
								)}
							</div>
							<div>
								<h3 className="text-xs font-medium uppercase tracking-wide text-neutral-500">
									Push to event
								</h3>
								<select
									className={`${INPUT_CLASSES} mt-2`}
									value={pushEventId}
									onChange={(event) => setPushEventId(event.target.value)}
								>
									{events.map((event) => (
										<option key={event.id} value={event.id}>
											{event.name}
										</option>
									))}
								</select>
								<button
									type="button"
									className={`${buttonClasses("secondary", "sm")} mt-2`}
									disabled={!pushEventId}
									onClick={() =>
										run(async () => {
											const response = await fetch(
												`/api/admin/contacts/${profile.id}/push-to-event`,
												{
													method: "POST",
													headers: { "content-type": "application/json" },
													body: JSON.stringify({ eventId: pushEventId }),
												},
											);
											const data = (await response.json()) as {
												ok: boolean;
												error?: string;
												speakerName?: string;
											};
											if (!data.ok) throw new Error(data.error ?? "Push failed");
											await openProfile(profile.id);
											setMessage(`Added ${data.speakerName ?? profile.name} to event roster`);
										})
									}
								>
									Add to event roster
								</button>
							</div>
						</div>

						{duplicates.length > 0 ? (
							<div className="mt-6 rounded-md border border-amber-500/30 bg-amber-500/10 p-3">
								<h3 className="text-sm font-medium text-amber-200">Possible duplicates</h3>
								<p className="mt-1 text-xs text-amber-100/80">
									Same name, different email. Merge cannot be undone.
								</p>
								<select
									className={`${INPUT_CLASSES} mt-2`}
									value={mergeSecondaryId ?? ""}
									onChange={(event) => setMergeSecondaryId(event.target.value || null)}
								>
									{duplicates.map((dup) => (
										<option key={dup.id} value={dup.id}>
											{dup.name} · {dup.email}
										</option>
									))}
								</select>
								<button
									type="button"
									className={`${buttonClasses("secondary", "sm")} mt-2`}
									disabled={!mergeSecondaryId}
									onClick={() =>
										run(async () => {
											const response = await fetch("/api/admin/contacts/merge", {
												method: "POST",
												headers: { "content-type": "application/json" },
												body: JSON.stringify({
													primaryContactId: profile.id,
													secondaryContactId: mergeSecondaryId,
												}),
											});
											const data = (await response.json()) as {
												ok: boolean;
												contact?: ContactDetail;
												error?: string;
											};
											if (!data.ok || !data.contact) throw new Error(data.error ?? "Merge failed");
											setProfile(data.contact);
											setDuplicates([]);
											await refreshDirectory(filters);
											setMessage("Contacts merged");
										})
									}
								>
									Merge into this record
								</button>
							</div>
						) : null}

						<div className="mt-6">
							<h3 className="text-xs font-medium uppercase tracking-wide text-neutral-500">
								Activity
							</h3>
							<ul className="mt-2 space-y-2 text-sm">
								{profile.activities.map((entry) => (
									<li key={entry.id} className="rounded-md border border-neutral-800 px-3 py-2">
										<div className="flex justify-between gap-2 text-xs text-neutral-500">
											<span className="uppercase tracking-wide">{entry.kind}</span>
											<span>{new Date(entry.occurredAt).toLocaleString()}</span>
										</div>
										<p className="mt-1 whitespace-pre-wrap text-neutral-200">{entry.body}</p>
									</li>
								))}
							</ul>
						</div>

						{profile.stageHistory.length > 0 ? (
							<div className="mt-6">
								<h3 className="text-xs font-medium uppercase tracking-wide text-neutral-500">
									Stage history
								</h3>
								<ul className="mt-2 space-y-2 text-sm">
									{profile.stageHistory.map((entry) => (
										<li key={entry.id} className="rounded-md border border-neutral-800 px-3 py-2">
											<div className="flex justify-between gap-2 text-xs text-neutral-500">
												<span>
													{(entry.fromStage
														? PIPELINE_STAGE_LABELS[entry.fromStage]
														: "—") +
														" → " +
														PIPELINE_STAGE_LABELS[entry.toStage]}
												</span>
												<span>{new Date(entry.changedAt).toLocaleString()}</span>
											</div>
											{entry.note ? (
												<p className="mt-1 text-neutral-300">{entry.note}</p>
											) : null}
										</li>
									))}
								</ul>
							</div>
						) : null}
					</div>
				</div>
			) : null}
		</div>
	);
}

function KpiCard({ label, value }: { label: string; value: string }) {
	return (
		<div className="rounded-lg border border-neutral-800 bg-neutral-900/60 px-4 py-3">
			<p className="text-xs uppercase tracking-wide text-neutral-500">{label}</p>
			<p className="mt-2 text-2xl font-semibold text-neutral-100">{value}</p>
		</div>
	);
}
