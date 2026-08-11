"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState, useTransition, type ReactNode } from "react";
import { buttonClasses, Chip, INPUT_CLASSES, noticeClasses } from "@/components/ui";
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

export type ContactsViewId = "directory" | "pipeline" | "import" | "email";

type EventOption = { id: string; slug: string; name: string };

type Props = {
	initialContacts: AccountContact[];
	initialFilters: ContactFilters;
	initialOptions: { companies: string[]; titles: string[]; tags: string[] };
	initialKpis: ContactKpis;
	initialBoard: PipelineBoard;
	initialSegments: ContactSegment[];
	events: EventOption[];
	initialView: ContactsViewId;
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

const SECTIONS: Array<{
	id: ContactsViewId;
	label: string;
	description: string;
}> = [
	{
		id: "directory",
		label: "Directory",
		description: "Search, filter, and open contacts in your cross-event directory.",
	},
	{
		id: "pipeline",
		label: "Pipeline",
		description: "Move speakers through research, outreach, and confirmation.",
	},
	{
		id: "import",
		label: "Import",
		description: "Import a CSV or add a contact by hand.",
	},
	{
		id: "email",
		label: "Email",
		description: "Compose a bulk email to selected directory contacts.",
	},
];

export function parseContactsView(value: string | undefined): ContactsViewId {
	if (value === "pipeline" || value === "import" || value === "email") return value;
	return "directory";
}

function contactsHref(
	view: ContactsViewId,
	filters: ContactFilters,
	segmentId: string | null,
) {
	const params = new URLSearchParams();
	if (view !== "directory") params.set("view", view);
	if (filters.q) params.set("q", filters.q);
	if (filters.company) params.set("company", filters.company);
	if (filters.title) params.set("title", filters.title);
	if (filters.tag) params.set("tag", filters.tag);
	if (filters.stage && filters.stage !== "all") params.set("stage", filters.stage);
	if (segmentId) params.set("segment", segmentId);
	const qs = params.toString();
	return qs ? `/admin/contacts?${qs}` : "/admin/contacts";
}

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
	const [view, setViewState] = useState<ContactsViewId>(initialView);
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

	const active = useMemo(
		() => SECTIONS.find((item) => item.id === view) ?? SECTIONS[0]!,
		[view],
	);

	const selectedContacts = useMemo(
		() => contacts.filter((contact) => selected.has(contact.id)),
		[contacts, selected],
	);

	const setView = useCallback(
		(next: ContactsViewId) => {
			setViewState(next);
			router.replace(contactsHref(next, filters, activeSegmentId), { scroll: false });
			if (next === "pipeline") {
				startTransition(() => {
					void fetch("/api/admin/contacts/pipeline")
						.then(async (response) => {
							const data = (await response.json()) as {
								ok: boolean;
								board?: PipelineBoard;
								error?: string;
							};
							if (!data.ok || !data.board) throw new Error(data.error ?? "Failed to load pipeline");
							setBoard(data.board);
						})
						.catch((err: unknown) => {
							setError(err instanceof Error ? err.message : "Something went wrong");
						});
				});
			}
		},
		[activeSegmentId, filters, router],
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
			router.replace(contactsHref(view, cleared, null));
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
		<div className="mt-8 lg:grid lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-8">
			<aside className="mb-6 lg:mb-0">
				<label className="mb-2 block text-xs font-medium uppercase tracking-wide text-neutral-500 lg:hidden">
					Contacts section
					<select
						value={view}
						onChange={(event) => setView(parseContactsView(event.target.value))}
						className={`mt-1.5 w-full ${INPUT_CLASSES}`}
					>
						{SECTIONS.map((item) => (
							<option key={item.id} value={item.id}>
								{item.label}
							</option>
						))}
					</select>
				</label>
				<nav aria-label="Contacts sections" className="hidden lg:sticky lg:top-20 lg:block">
					<ul className="space-y-1 border-l border-neutral-800">
						{SECTIONS.map((item) => {
							const selectedSection = item.id === view;
							return (
								<li key={item.id}>
									<button
										type="button"
										onClick={() => setView(item.id)}
										aria-current={selectedSection ? "page" : undefined}
										className={
											selectedSection
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
				{error ? (
					<p aria-live="polite" className={noticeClasses("negative")}>
						{error}
					</p>
				) : null}
				{message ? (
					<p aria-live="polite" className={noticeClasses("positive")}>
						{message}
					</p>
				) : null}

				<section>
					<header className="mb-6 border-b border-neutral-800 pb-4">
						<div className="flex flex-wrap items-baseline justify-between gap-2">
							<h2 className="text-lg font-semibold text-neutral-100">{active.label}</h2>
							<p className="text-xs text-neutral-500">
								{pending ? "Working…" : `${contacts.length} shown`}
								{view === "email" ? ` · ${selectedContacts.length} selected` : ""}
							</p>
						</div>
						<p className="mt-1 text-sm text-neutral-400">{active.description}</p>
						{view === "directory" ? (
							<p className="mt-3 text-sm text-neutral-400">
								<span className="text-neutral-200">{kpis.totalContacts}</span> contacts
								<span className="mx-2 text-neutral-700">·</span>
								<span className="text-neutral-200">{kpis.inPipeline}</span> in pipeline
								<span className="mx-2 text-neutral-700">·</span>
								<span className="text-neutral-200">{kpis.confirmed}</span> confirmed
							</p>
						) : null}
					</header>

					{view === "directory" ? (
						<DirectorySection
							contacts={contacts}
							filters={filters}
							options={options}
							kpis={kpis}
							segments={segments}
							segmentName={segmentName}
							activeSegmentId={activeSegmentId}
							selected={selected}
							onFiltersChange={setFilters}
							onSegmentNameChange={setSegmentName}
							onActiveSegmentIdChange={setActiveSegmentId}
							onToggleSelected={toggleSelected}
							onClearFilters={clearFilters}
							onApplySearch={(nextFilters = filters) =>
								run(async () => {
									await refreshDirectory(nextFilters);
									router.replace(contactsHref(view, nextFilters, activeSegmentId));
								})
							}
							onCompanyChip={(company) => {
								const next = { ...filters, company };
								setFilters(next);
								run(async () => {
									await refreshDirectory(next);
									router.replace(contactsHref("directory", next, activeSegmentId));
								});
							}}
							onSaveSegment={() =>
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
									setSegments((prev) =>
										[...prev, data.segment!].sort((a, b) => a.name.localeCompare(b.name)),
									);
									setActiveSegmentId(data.segment.id);
									setMessage(`Saved segment “${data.segment.name}”`);
									router.replace(contactsHref(view, filters, data.segment.id));
								})
							}
							onOpenSegment={(id) => {
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
									setMessage(
										`Opened segment “${data.segment.name}” (${data.contacts?.length ?? 0})`,
									);
									router.replace(contactsHref(view, data.segment.filters, id));
								});
							}}
							onOpenProfile={(id) => run(async () => openProfile(id))}
						/>
					) : null}

					{view === "pipeline" ? (
						<PipelineSection
							board={board}
							contacts={contacts}
							enrollContactId={enrollContactId}
							onEnrollContactIdChange={setEnrollContactId}
							onEnroll={() =>
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
							onMove={(contactId, toStage) =>
								run(async () => {
									const response = await fetch("/api/admin/contacts/pipeline", {
										method: "PATCH",
										headers: { "content-type": "application/json" },
										body: JSON.stringify({ contactId, stage: toStage }),
									});
									const data = (await response.json()) as {
										ok: boolean;
										board?: PipelineBoard;
										error?: string;
									};
									if (!data.ok || !data.board) throw new Error(data.error ?? "Move failed");
									setBoard(data.board);
									await refreshDirectory(filters);
								})
							}
							onOpenProfile={(id) => run(async () => openProfile(id))}
						/>
					) : null}

					{view === "import" ? (
						<ImportSection
							csvText={csvText}
							draft={draft}
							onCsvTextChange={setCsvText}
							onDraftChange={setDraft}
							onImport={() =>
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
							onCreate={() =>
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
						/>
					) : null}

					{view === "email" ? (
						<EmailSection
							events={events}
							selectedCount={selectedContacts.length}
							emailEventId={emailEventId}
							emailSubject={emailSubject}
							emailBody={emailBody}
							onEmailEventIdChange={setEmailEventId}
							onEmailSubjectChange={setEmailSubject}
							onEmailBodyChange={setEmailBody}
							onSend={() =>
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
						/>
					) : null}
				</section>
			</div>

			{profile ? (
				<ContactDetailModal
					profile={profile}
					profileNote={profileNote}
					profileTag={profileTag}
					events={events}
					pushEventId={pushEventId}
					duplicates={duplicates}
					mergeSecondaryId={mergeSecondaryId}
					onClose={() => setProfile(null)}
					onProfileNoteChange={setProfileNote}
					onProfileTagChange={setProfileTag}
					onPushEventIdChange={setPushEventId}
					onMergeSecondaryIdChange={setMergeSecondaryId}
					onSaveTag={() =>
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
					onSaveNote={() =>
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
					onPush={() =>
						run(async () => {
							const response = await fetch(`/api/admin/contacts/${profile.id}/push-to-event`, {
								method: "POST",
								headers: { "content-type": "application/json" },
								body: JSON.stringify({ eventId: pushEventId }),
							});
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
					onMerge={() =>
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
				/>
			) : null}
		</div>
	);
}

function FieldLabel({ children }: { children: ReactNode }) {
	return <span className="font-medium text-neutral-200">{children}</span>;
}

function DirectorySection({
	contacts,
	filters,
	options,
	kpis,
	segments,
	segmentName,
	activeSegmentId,
	selected,
	onFiltersChange,
	onSegmentNameChange,
	onActiveSegmentIdChange,
	onToggleSelected,
	onClearFilters,
	onApplySearch,
	onCompanyChip,
	onSaveSegment,
	onOpenSegment,
	onOpenProfile,
}: {
	contacts: AccountContact[];
	filters: ContactFilters;
	options: { companies: string[]; titles: string[]; tags: string[] };
	kpis: ContactKpis;
	segments: ContactSegment[];
	segmentName: string;
	activeSegmentId: string | null;
	selected: Set<string>;
	onFiltersChange: (next: ContactFilters | ((prev: ContactFilters) => ContactFilters)) => void;
	onSegmentNameChange: (value: string) => void;
	onActiveSegmentIdChange: (value: string | null) => void;
	onToggleSelected: (id: string) => void;
	onClearFilters: () => void;
	onApplySearch: (nextFilters?: ContactFilters) => void;
	onCompanyChip: (company: string) => void;
	onSaveSegment: () => void;
	onOpenSegment: (id: string | null) => void;
	onOpenProfile: (id: string) => void;
}) {
	return (
		<div className="space-y-8">
			<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
				<label className="block space-y-1.5 text-sm sm:col-span-2">
					<FieldLabel>Search</FieldLabel>
					<input
						className={`w-full ${INPUT_CLASSES}`}
						value={filters.q ?? ""}
						placeholder="Name, email, company…"
						onChange={(event) => onFiltersChange((prev) => ({ ...prev, q: event.target.value }))}
						onKeyDown={(event) => {
							if (event.key === "Enter") onApplySearch();
						}}
					/>
				</label>
				<label className="block space-y-1.5 text-sm">
					<FieldLabel>Company</FieldLabel>
					<select
						className={`w-full ${INPUT_CLASSES}`}
						value={filters.company ?? ""}
						onChange={(event) => {
							const next = { ...filters, company: event.target.value || undefined };
							onFiltersChange(next);
							onApplySearch(next);
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
				<label className="block space-y-1.5 text-sm">
					<FieldLabel>Title</FieldLabel>
					<select
						className={`w-full ${INPUT_CLASSES}`}
						value={filters.title ?? ""}
						onChange={(event) => {
							const next = { ...filters, title: event.target.value || undefined };
							onFiltersChange(next);
							onApplySearch(next);
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
				<label className="block space-y-1.5 text-sm">
					<FieldLabel>Tag</FieldLabel>
					<select
						className={`w-full ${INPUT_CLASSES}`}
						value={filters.tag ?? ""}
						onChange={(event) => {
							const next = { ...filters, tag: event.target.value || undefined };
							onFiltersChange(next);
							onApplySearch(next);
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

			{kpis.topCompanies.length > 0 ? (
				<div className="space-y-2">
					<p className="text-sm font-medium text-neutral-200">Top companies</p>
					<div className="flex flex-wrap gap-2">
						{kpis.topCompanies.map((row) => (
							<button
								key={row.company}
								type="button"
								className={
									filters.company === row.company
										? "rounded-md border border-neutral-500 bg-neutral-900 px-2.5 py-1 text-xs font-medium text-neutral-100"
										: "rounded-md border border-neutral-800 px-2.5 py-1 text-xs text-neutral-400 hover:border-neutral-600 hover:text-neutral-200"
								}
								onClick={() => onCompanyChip(row.company)}
							>
								{row.company}{" "}
								<span className="text-neutral-500">({row.count})</span>
							</button>
						))}
					</div>
				</div>
			) : null}

			<div className="flex flex-wrap gap-2">
				<button type="button" className={buttonClasses("primary")} onClick={() => onApplySearch()}>
					Apply search
				</button>
				<button type="button" className={buttonClasses("secondary")} onClick={onClearFilters}>
					Clear filters
				</button>
			</div>

			<div className="grid gap-4 border-t border-neutral-800 pt-6 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
				<label className="block space-y-1.5 text-sm">
					<FieldLabel>Save segment</FieldLabel>
					<input
						className={`w-full ${INPUT_CLASSES}`}
						value={segmentName}
						onChange={(event) => onSegmentNameChange(event.target.value)}
					/>
				</label>
				<button type="button" className={buttonClasses("secondary")} onClick={onSaveSegment}>
					Save segment
				</button>
			</div>

			{segments.length > 0 ? (
				<label className="mt-4 block max-w-md space-y-1.5 text-sm">
					<FieldLabel>Open segment</FieldLabel>
					<select
						className={`w-full ${INPUT_CLASSES}`}
						value={activeSegmentId ?? ""}
						onChange={(event) => {
							const id = event.target.value || null;
							onActiveSegmentIdChange(id);
							onOpenSegment(id);
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

			<div className="overflow-x-auto border-t border-neutral-800 pt-6">
				<table className="min-w-full text-left text-sm">
					<thead className="text-xs uppercase tracking-wide text-neutral-500">
						<tr className="border-b border-neutral-800">
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
					<tbody className="divide-y divide-neutral-800">
						{contacts.length === 0 ? (
							<tr>
								<td colSpan={7} className="px-3 py-8 text-center text-neutral-500">
									No contacts yet. Import a CSV or add one from Import.
								</td>
							</tr>
						) : (
							contacts.map((contact) => (
								<tr key={contact.id} className="hover:bg-neutral-900/40">
									<td className="px-3 py-2">
										<input
											type="checkbox"
											checked={selected.has(contact.id)}
											onChange={() => onToggleSelected(contact.id)}
											aria-label={`Select ${contact.name}`}
										/>
									</td>
									<td className="px-3 py-2">
										<button
											type="button"
											className="font-medium text-neutral-100 hover:underline"
											onClick={() => onOpenProfile(contact.id)}
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
												<Chip key={tag}>{tag}</Chip>
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
			</div>
		</div>
	);
}

function PipelineSection({
	board,
	contacts,
	enrollContactId,
	onEnrollContactIdChange,
	onEnroll,
	onMove,
	onOpenProfile,
}: {
	board: PipelineBoard;
	contacts: AccountContact[];
	enrollContactId: string;
	onEnrollContactIdChange: (value: string) => void;
	onEnroll: () => void;
	onMove: (contactId: string, stage: ContactPipelineStage) => void;
	onOpenProfile: (id: string) => void;
}) {
	return (
		<div className="space-y-6">
			<div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
				<label className="block space-y-1.5 text-sm">
					<FieldLabel>Enroll contact</FieldLabel>
					<select
						className={`w-full ${INPUT_CLASSES}`}
						value={enrollContactId}
						onChange={(event) => onEnrollContactIdChange(event.target.value)}
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
					className={buttonClasses("primary")}
					disabled={!enrollContactId}
					onClick={onEnroll}
				>
					Enroll
				</button>
			</div>

			<div className="grid gap-4 xl:grid-cols-5">
				{CONTACT_PIPELINE_STAGES.map((stage) => (
					<div key={stage} className="min-w-0">
						<div className="mb-3 border-b border-neutral-800 pb-2 text-xs font-medium uppercase tracking-wide text-neutral-400">
							{PIPELINE_STAGE_LABELS[stage]} ({board[stage].length})
						</div>
						<ul className="space-y-3">
							{board[stage].map((contact) => (
								<li key={contact.id} className="border-b border-neutral-900 pb-3 last:border-0">
									<button
										type="button"
										className="block w-full text-left text-sm font-medium text-neutral-100 hover:underline"
										onClick={() => onOpenProfile(contact.id)}
									>
										{contact.name}
									</button>
									<p className="truncate text-xs text-neutral-500">
										{contact.company ?? contact.email}
									</p>
									<label className="mt-2 block space-y-1 text-xs text-neutral-500">
										<span>Move to</span>
										<select
											className={`w-full ${INPUT_CLASSES}`}
											value={stage}
											onChange={(event) =>
												onMove(contact.id, event.target.value as ContactPipelineStage)
											}
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
		</div>
	);
}

function ImportSection({
	csvText,
	draft,
	onCsvTextChange,
	onDraftChange,
	onImport,
	onCreate,
}: {
	csvText: string;
	draft: CreateDraft;
	onCsvTextChange: (value: string) => void;
	onDraftChange: (value: CreateDraft | ((prev: CreateDraft) => CreateDraft)) => void;
	onImport: () => void;
	onCreate: () => void;
}) {
	return (
		<div className="space-y-10">
			<div className="space-y-4">
				<div>
					<h3 className="text-sm font-medium text-neutral-100">Import CSV</h3>
					<p className="mt-1 text-sm text-neutral-500">
						Columns: name, email, title, company, bio. Re-import dedupes on email.
					</p>
				</div>
				<label className="block space-y-1.5 text-sm">
					<FieldLabel>CSV</FieldLabel>
					<textarea
						className={`min-h-40 w-full whitespace-pre break-all font-mono text-xs ${INPUT_CLASSES}`}
						value={csvText}
						onChange={(event) => onCsvTextChange(event.target.value)}
						placeholder={"name,email,title,company,bio\nPriya Raman,priya@example.com,…"}
						spellCheck={false}
					/>
				</label>
				<button type="button" className={buttonClasses("primary")} onClick={onImport}>
					Import contacts
				</button>
			</div>

			<div className="space-y-4 border-t border-neutral-800 pt-8">
				<div>
					<h3 className="text-sm font-medium text-neutral-100">Add contact</h3>
					<p className="mt-1 text-sm text-neutral-500">Create a single contact without a CSV.</p>
				</div>
				<div className="grid gap-4 sm:grid-cols-2">
					<label className="block space-y-1.5 text-sm">
						<FieldLabel>Name</FieldLabel>
						<input
							className={`w-full ${INPUT_CLASSES}`}
							value={draft.name}
							onChange={(event) => onDraftChange((prev) => ({ ...prev, name: event.target.value }))}
						/>
					</label>
					<label className="block space-y-1.5 text-sm">
						<FieldLabel>Email</FieldLabel>
						<input
							className={`w-full ${INPUT_CLASSES}`}
							type="email"
							value={draft.email}
							onChange={(event) => onDraftChange((prev) => ({ ...prev, email: event.target.value }))}
						/>
					</label>
					<label className="block space-y-1.5 text-sm">
						<FieldLabel>Title</FieldLabel>
						<input
							className={`w-full ${INPUT_CLASSES}`}
							value={draft.title}
							onChange={(event) => onDraftChange((prev) => ({ ...prev, title: event.target.value }))}
						/>
					</label>
					<label className="block space-y-1.5 text-sm">
						<FieldLabel>Company</FieldLabel>
						<input
							className={`w-full ${INPUT_CLASSES}`}
							value={draft.company}
							onChange={(event) =>
								onDraftChange((prev) => ({ ...prev, company: event.target.value }))
							}
						/>
					</label>
					<label className="block space-y-1.5 text-sm sm:col-span-2">
						<FieldLabel>Bio</FieldLabel>
						<textarea
							className={`min-h-24 w-full ${INPUT_CLASSES}`}
							value={draft.bio}
							onChange={(event) => onDraftChange((prev) => ({ ...prev, bio: event.target.value }))}
						/>
					</label>
				</div>
				<button type="button" className={buttonClasses("primary")} onClick={onCreate}>
					Create contact
				</button>
			</div>
		</div>
	);
}

function EmailSection({
	events,
	selectedCount,
	emailEventId,
	emailSubject,
	emailBody,
	onEmailEventIdChange,
	onEmailSubjectChange,
	onEmailBodyChange,
	onSend,
}: {
	events: EventOption[];
	selectedCount: number;
	emailEventId: string;
	emailSubject: string;
	emailBody: string;
	onEmailEventIdChange: (value: string) => void;
	onEmailSubjectChange: (value: string) => void;
	onEmailBodyChange: (value: string) => void;
	onSend: () => void;
}) {
	return (
		<div className="space-y-4">
			<p className="text-sm text-neutral-500">
				Select contacts in Directory, then compose here. {selectedCount} selected.
			</p>
			<div className="grid gap-4 sm:grid-cols-2">
				<label className="block space-y-1.5 text-sm">
					<FieldLabel>Log against event</FieldLabel>
					<select
						className={`w-full ${INPUT_CLASSES}`}
						value={emailEventId}
						onChange={(event) => onEmailEventIdChange(event.target.value)}
					>
						{events.map((event) => (
							<option key={event.id} value={event.id}>
								{event.name}
							</option>
						))}
					</select>
				</label>
				<label className="block space-y-1.5 text-sm">
					<FieldLabel>Subject</FieldLabel>
					<input
						className={`w-full ${INPUT_CLASSES}`}
						value={emailSubject}
						onChange={(event) => onEmailSubjectChange(event.target.value)}
					/>
				</label>
				<label className="block space-y-1.5 text-sm sm:col-span-2">
					<FieldLabel>Body</FieldLabel>
					<textarea
						className={`min-h-40 w-full ${INPUT_CLASSES}`}
						value={emailBody}
						onChange={(event) => onEmailBodyChange(event.target.value)}
					/>
					<span className="block text-xs text-neutral-500">
						Merge fields: {"{{first_name}}"}, {"{{name}}"}, {"{{company}}"}.
					</span>
				</label>
			</div>
			<button
				type="button"
				className={buttonClasses("primary")}
				disabled={selectedCount === 0 || !emailEventId}
				onClick={onSend}
			>
				Send email
			</button>
		</div>
	);
}

function ContactDetailModal({
	profile,
	profileNote,
	profileTag,
	events,
	pushEventId,
	duplicates,
	mergeSecondaryId,
	onClose,
	onProfileNoteChange,
	onProfileTagChange,
	onPushEventIdChange,
	onMergeSecondaryIdChange,
	onSaveTag,
	onSaveNote,
	onPush,
	onMerge,
}: {
	profile: ContactDetail;
	profileNote: string;
	profileTag: string;
	events: EventOption[];
	pushEventId: string;
	duplicates: AccountContact[];
	mergeSecondaryId: string | null;
	onClose: () => void;
	onProfileNoteChange: (value: string) => void;
	onProfileTagChange: (value: string) => void;
	onPushEventIdChange: (value: string) => void;
	onMergeSecondaryIdChange: (value: string | null) => void;
	onSaveTag: () => void;
	onSaveNote: () => void;
	onPush: () => void;
	onMerge: () => void;
}) {
	return (
		<div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 p-4">
			<div className="my-8 w-full max-w-2xl rounded-lg border border-neutral-700 bg-neutral-950 p-5 shadow-xl">
				<div className="flex items-start justify-between gap-3 border-b border-neutral-800 pb-4">
					<div>
						<h2 className="text-xl font-semibold text-neutral-100">{profile.name}</h2>
						<p className="text-sm text-neutral-400">{profile.email}</p>
						<p className="mt-1 text-sm text-neutral-500">
							{[profile.title, profile.company].filter(Boolean).join(" · ") || "No title/company"}
						</p>
					</div>
					<button type="button" className={buttonClasses("secondary")} onClick={onClose}>
						Close
					</button>
				</div>

				{profile.bio ? (
					<p className="mt-4 text-sm leading-6 text-neutral-300">{profile.bio}</p>
				) : null}

				<div className="mt-6 space-y-4">
					{profile.tags.length > 0 ? (
						<div className="flex flex-wrap gap-1.5">
							{profile.tags.map((tag) => (
								<Chip key={tag}>{tag}</Chip>
							))}
						</div>
					) : null}

					<label className="block space-y-1.5 text-sm">
						<FieldLabel>Add tag</FieldLabel>
						<input
							className={`w-full ${INPUT_CLASSES}`}
							placeholder="e.g. AI"
							value={profileTag}
							onChange={(event) => onProfileTagChange(event.target.value)}
						/>
					</label>
					<button type="button" className={buttonClasses("secondary")} onClick={onSaveTag}>
						Save tag
					</button>

					<label className="block space-y-1.5 text-sm">
						<FieldLabel>Internal note</FieldLabel>
						<textarea
							className={`min-h-24 w-full ${INPUT_CLASSES}`}
							value={profileNote}
							onChange={(event) => onProfileNoteChange(event.target.value)}
							placeholder="Met at DevFlow 2026…"
						/>
					</label>
					<button type="button" className={buttonClasses("primary")} onClick={onSaveNote}>
						Save note
					</button>
				</div>

				<div className="mt-8 grid gap-6 border-t border-neutral-800 pt-6 sm:grid-cols-2">
					<div>
						<h3 className="text-sm font-medium text-neutral-200">Event history</h3>
						{profile.eventLinks.length === 0 ? (
							<p className="mt-2 text-sm text-neutral-500">No linked events yet.</p>
						) : (
							<ul className="mt-2 divide-y divide-neutral-800 text-sm">
								{profile.eventLinks.map((link) => (
									<li key={`${link.eventId}-${link.personId}`} className="py-2">
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
					<div className="space-y-3">
						<label className="block space-y-1.5 text-sm">
							<FieldLabel>Push to event</FieldLabel>
							<select
								className={`w-full ${INPUT_CLASSES}`}
								value={pushEventId}
								onChange={(event) => onPushEventIdChange(event.target.value)}
							>
								{events.map((event) => (
									<option key={event.id} value={event.id}>
										{event.name}
									</option>
								))}
							</select>
						</label>
						<button
							type="button"
							className={buttonClasses("secondary")}
							disabled={!pushEventId}
							onClick={onPush}
						>
							Add to event roster
						</button>
					</div>
				</div>

				{duplicates.length > 0 ? (
					<div className="mt-6 space-y-3 rounded-md border border-amber-500/30 bg-amber-500/10 p-3">
						<div>
							<h3 className="text-sm font-medium text-amber-200">Possible duplicates</h3>
							<p className="mt-1 text-xs text-amber-100/80">
								Same name, different email. Merge cannot be undone.
							</p>
						</div>
						<label className="block space-y-1.5 text-sm">
							<span className="font-medium text-amber-100">Merge with</span>
							<select
								className={`w-full ${INPUT_CLASSES}`}
								value={mergeSecondaryId ?? ""}
								onChange={(event) => onMergeSecondaryIdChange(event.target.value || null)}
							>
								{duplicates.map((dup) => (
									<option key={dup.id} value={dup.id}>
										{dup.name} · {dup.email}
									</option>
								))}
							</select>
						</label>
						<button
							type="button"
							className={buttonClasses("secondary")}
							disabled={!mergeSecondaryId}
							onClick={onMerge}
						>
							Merge into this record
						</button>
					</div>
				) : null}

				<div className="mt-8 border-t border-neutral-800 pt-6">
					<h3 className="text-sm font-medium text-neutral-200">Activity</h3>
					<ul className="mt-3 divide-y divide-neutral-800 text-sm">
						{profile.activities.map((entry) => (
							<li key={entry.id} className="py-3">
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
					<div className="mt-8 border-t border-neutral-800 pt-6">
						<h3 className="text-sm font-medium text-neutral-200">Stage history</h3>
						<ul className="mt-3 divide-y divide-neutral-800 text-sm">
							{profile.stageHistory.map((entry) => (
								<li key={entry.id} className="py-3">
									<div className="flex justify-between gap-2 text-xs text-neutral-500">
										<span>
											{(entry.fromStage ? PIPELINE_STAGE_LABELS[entry.fromStage] : "—") +
												" → " +
												PIPELINE_STAGE_LABELS[entry.toStage]}
										</span>
										<span>{new Date(entry.changedAt).toLocaleString()}</span>
									</div>
									{entry.note ? <p className="mt-1 text-neutral-300">{entry.note}</p> : null}
								</li>
							))}
						</ul>
					</div>
				) : null}
			</div>
		</div>
	);
}
