"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { PublicSpeakerAvatar } from "@/components/public-speaker-avatar";
import type { PublicEmbedPayload } from "@/lib/embeds/embed";
import { truncatePreview } from "@/lib/schedule/public-discover";

type Session = PublicEmbedPayload["sessions"][number];
type Speaker = PublicEmbedPayload["speakers"][number];

function formatDateTime(value: number, timezone: string): string {
	return new Intl.DateTimeFormat("en", {
		timeZone: timezone,
		dateStyle: "medium",
		timeStyle: "short",
	}).format(value);
}

function formatTime(value: number, timezone: string): string {
	return new Intl.DateTimeFormat("en", {
		timeZone: timezone,
		timeStyle: "short",
	}).format(value);
}

function dayKey(value: number, timezone: string): string {
	const parts = new Intl.DateTimeFormat("en-CA", {
		timeZone: timezone,
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
	}).formatToParts(value);
	const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? "";
	return `${part("year")}-${part("month")}-${part("day")}`;
}

function dayLabel(value: number, timezone: string): string {
	return new Intl.DateTimeFormat("en", {
		timeZone: timezone,
		weekday: "short",
		month: "short",
		day: "numeric",
	}).format(value);
}

function uniqueValues(sessions: Session[], field: "track" | "format" | "room"): string[] {
	return [...new Set(sessions.map((session) => session[field]).filter(Boolean))]
		.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
}

function countLabel(count: number, noun: string): string {
	return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

function SpeakerLine({
	speaker,
	showJobTitle,
	showCompany,
}: {
	speaker: Session["speakers"][number];
	showJobTitle: boolean;
	showCompany: boolean;
}) {
	const affiliation = [showJobTitle ? speaker.jobTitle : null, showCompany ? speaker.company : null]
		.filter(Boolean)
		.join(" at ");
	return (
		<li>
			{speaker.url ? (
				<Link className="font-medium text-neutral-200 hover:underline" href={speaker.url} target="_blank">
					{speaker.name}
				</Link>
			) : (
				<span className="font-medium text-neutral-200">{speaker.name}</span>
			)}
			{affiliation ? <span className="text-neutral-500"> · {affiliation}</span> : null}
		</li>
	);
}

function SessionSpeakerList({
	session,
	fields,
	className = "mt-3",
}: {
	session: Session;
	fields: Set<string>;
	className?: string;
}) {
	if (!fields.has("speakers") || session.speakers.length === 0) return null;
	return (
		<ul className={`${className} space-y-1 text-sm`} aria-label={`Speakers for ${session.title}`}>
			{session.speakers.map((speaker, index) => (
				<SpeakerLine
					key={speaker.id ?? `${session.id}-${index}`}
					speaker={speaker}
					showJobTitle={fields.has("jobTitle")}
					showCompany={fields.has("company")}
				/>
			))}
		</ul>
	);
}

function SessionDescription({ text }: { text: string }) {
	const summary = truncatePreview(text, 180);
	const [expanded, setExpanded] = useState(false);
	if (!text) return null;
	return (
		<div className="mt-3 text-sm leading-6 text-neutral-400">
			<p>{expanded ? text : summary.preview}</p>
			{summary.truncated ? (
				<button
					type="button"
					className="mt-1 font-medium text-[var(--embed-accent)] hover:underline"
					onClick={() => setExpanded((current) => !current)}
				>
					{expanded ? "Show less" : "Show more"}
				</button>
			) : null}
		</div>
	);
}

function SessionCard({ payload, session }: { payload: PublicEmbedPayload; session: Session }) {
	const fields = new Set(payload.embed.config.visibleFields);
	return (
		<article className="h-full rounded-lg border border-neutral-800 bg-neutral-900/40 p-4">
			<div className="h-1 w-12 rounded bg-[var(--embed-accent)]" />
			{fields.has("time") ? (
				<p className="mt-3 font-mono text-xs text-neutral-500">
					{formatDateTime(session.startsAt, payload.event.timezone)}–{formatTime(session.endsAt, payload.event.timezone)}
				</p>
			) : null}
			{fields.has("title") ? (
				<Link className="mt-1 block text-lg font-semibold text-neutral-100 hover:underline" href={session.url} target="_blank">
					{session.title}
				</Link>
			) : null}
			<div className="mt-2 flex flex-wrap gap-2 text-xs">
				{fields.has("track") ? <span className="rounded-full bg-neutral-800 px-2 py-1">Track: {session.track}</span> : null}
				{fields.has("format") ? <span className="rounded-full bg-neutral-800 px-2 py-1">Format: {session.format}</span> : null}
			</div>
			{fields.has("room") ? <p className="mt-3 text-sm text-neutral-400">Room: {session.room}</p> : null}
			{fields.has("abstract") ? <SessionDescription text={session.abstract} /> : null}
			<SessionSpeakerList session={session} fields={fields} />
		</article>
	);
}

export function SessionsWidget({ payload }: { payload: PublicEmbedPayload }) {
	const [query, setQuery] = useState("");
	const [track, setTrack] = useState("all");
	const [format, setFormat] = useState("all");
	const [room, setRoom] = useState("all");
	const sessions = useMemo(() => payload.sessions.filter((session) => {
		const needle = query.trim().toLowerCase();
		const searchMatches = !needle || [session.title, ...session.speakers.map((speaker) => speaker.name)]
			.join("\0")
			.toLowerCase()
			.includes(needle);
		return searchMatches
			&& (track === "all" || session.track === track)
			&& (format === "all" || session.format === format)
			&& (room === "all" || session.room === room);
	}), [format, payload.sessions, query, room, track]);

	return (
		<section className="mt-6">
		<div className="grid gap-3 rounded-lg border border-neutral-800 bg-neutral-900/50 p-4 md:grid-cols-[minmax(12rem,1fr)_repeat(3,minmax(8rem,auto))]">
			<label className="text-xs font-medium text-neutral-400">
				Search sessions or speakers
				<input
					type="search"
					value={query}
					onChange={(event) => setQuery(event.target.value)}
					placeholder="Title or speaker name"
					className="mt-1 w-full rounded border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-100"
				/>
			</label>
			<Facet label="Track" value={track} values={uniqueValues(payload.sessions, "track")} onChange={setTrack} />
			<Facet label="Format" value={format} values={uniqueValues(payload.sessions, "format")} onChange={setFormat} />
			<Facet label="Room" value={room} values={uniqueValues(payload.sessions, "room")} onChange={setRoom} />
		</div>
		<p className="mt-4 text-sm text-neutral-400" aria-live="polite">{countLabel(sessions.length, "result")}</p>
		<ul className="mt-3 grid gap-4 sm:grid-cols-2">
			{sessions.map((session) => (
				<li key={session.id}><SessionCard payload={payload} session={session} /></li>
			))}
		</ul>
	</section>
	);
}

function Facet({ label, value, values, onChange }: { label: string; value: string; values: string[]; onChange: (value: string) => void }) {
	return (
		<label className="text-xs font-medium text-neutral-400">
			{label}
			<select
				aria-label={label}
				value={value}
				onChange={(event) => onChange(event.target.value)}
				className="mt-1 w-full rounded border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-100"
			>
				<option value="all">All {label.toLowerCase()}s</option>
				{values.map((item) => <option key={item} value={item}>{item}</option>)}
			</select>
		</label>
	);
}

function SpeakerImage({ payload, speaker, gallery }: { payload: PublicEmbedPayload; speaker: Speaker; gallery: boolean }) {
	return (
		<PublicSpeakerAvatar
			eventSlug={payload.event.slug}
			personId={speaker.id}
			name={speaker.name}
			hasHeadshot={Boolean(speaker.headshotUrl)}
			size={gallery ? "lg" : "md"}
			showName={false}
		/>
	);
}

function SpeakerCard({
	payload,
	speaker,
	gallery,
	onOpenDetails,
	detailsButtonRef,
}: {
	payload: PublicEmbedPayload;
	speaker: Speaker;
	gallery: boolean;
	onOpenDetails?: () => void;
	detailsButtonRef?: (element: HTMLButtonElement | null) => void;
}) {
	const fields = new Set(payload.embed.config.visibleFields);
	return (
		<article className={gallery ? "h-full rounded-lg border border-neutral-800 bg-neutral-900/40 p-4 text-center" : fields.has("headshot") ? "grid gap-4 py-5 sm:grid-cols-[auto_1fr]" : "py-5"}>
			{fields.has("headshot") ? (
				<div className={gallery ? "flex justify-center" : ""}>
					<SpeakerImage payload={payload} speaker={speaker} gallery={gallery} />
				</div>
			) : null}
			<div>
				<Link className="font-semibold text-neutral-100 hover:underline" href={speaker.url} target="_blank">
					{speaker.name}
				</Link>
				{fields.has("jobTitle") || fields.has("company") ? (
					<p className="mt-1 text-sm text-neutral-400">
						{[fields.has("jobTitle") ? speaker.jobTitle : null, fields.has("company") ? speaker.company : null].filter(Boolean).join(" · ")}
					</p>
				) : null}
				{fields.has("bio") && speaker.bio ? <p className="mt-2 text-sm leading-6 text-neutral-400">{speaker.bio}</p> : null}
				{speaker.sessions.length > 0 ? (
					<div className="mt-4 text-left">
						<p className="text-xs font-medium uppercase tracking-wide text-neutral-500">Sessions ({speaker.sessions.length})</p>
						<ul className="mt-2 space-y-2">
							{speaker.sessions.map((session) => (
								<li key={session.id} className="text-sm">
									<Link className="font-medium text-neutral-200 hover:underline" href={session.url} target="_blank">{session.title}</Link>
									<p className="text-xs text-neutral-500">{formatDateTime(session.startsAt, payload.event.timezone)}–{formatTime(session.endsAt, payload.event.timezone)} · {session.room}</p>
								</li>
							))}
						</ul>
					</div>
				) : null}
				{gallery && onOpenDetails ? (
					<button
						ref={detailsButtonRef}
						type="button"
						aria-haspopup="dialog"
						aria-label={`View details for ${speaker.name}`}
						className="mt-4 rounded border border-neutral-700 px-3 py-2 text-sm font-medium text-neutral-200 hover:border-[var(--embed-accent)] hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--embed-accent)]"
						onClick={onOpenDetails}
					>
						View details
					</button>
				) : null}
			</div>
		</article>
	);
}

function SpeakerDetailDialog({
	payload,
	speaker,
	onClose,
}: {
	payload: PublicEmbedPayload;
	speaker: Speaker;
	onClose: () => void;
}) {
	const fields = new Set(payload.embed.config.visibleFields);
	const titleId = `speaker-detail-${speaker.id}-title`;
	const dialogRef = useRef<HTMLElement>(null);
	useEffect(() => {
		const dialog = dialogRef.current;
		if (!dialog) return;
		const previousOverflow = document.body.style.overflow;
		document.body.style.overflow = "hidden";
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key === "Escape") { event.preventDefault(); onClose(); return; }
			if (event.key !== "Tab") return;
			const focusable = [...dialog.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')].filter((element) => !element.hasAttribute("hidden"));
			if (!focusable.length) { event.preventDefault(); dialog.focus(); return; }
			const first = focusable[0]!;
			const last = focusable.at(-1)!;
			if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
			else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
			else if (!dialog.contains(document.activeElement)) { event.preventDefault(); first.focus(); }
		};
		document.addEventListener("keydown", onKeyDown);
		return () => { document.removeEventListener("keydown", onKeyDown); document.body.style.overflow = previousOverflow; };
	}, [onClose]);
	return (
		<div
			className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4"
			role="presentation"
			onMouseDown={(event) => {
				if (event.target === event.currentTarget) onClose();
			}}
		>
			<section
				ref={dialogRef}
				role="dialog"
				tabIndex={-1}
				aria-modal="true"
				aria-labelledby={titleId}
				className="max-h-[min(44rem,calc(100vh-2rem))] w-full max-w-2xl overflow-y-auto rounded-xl border border-neutral-700 bg-neutral-950 p-5 shadow-2xl sm:p-6"
			>
				<div className="flex items-start justify-between gap-4">
					<div className={fields.has("headshot") ? "grid gap-4 sm:grid-cols-[auto_1fr] sm:items-center" : ""}>
						{fields.has("headshot") ? <SpeakerImage payload={payload} speaker={speaker} gallery={false} /> : null}
						<div>
							<h2 id={titleId} className="text-2xl font-semibold text-neutral-100">{speaker.name}</h2>
							{fields.has("jobTitle") || fields.has("company") ? (
								<p className="mt-1 text-sm text-neutral-400">
									{[fields.has("jobTitle") ? speaker.jobTitle : null, fields.has("company") ? speaker.company : null].filter(Boolean).join(" · ")}
								</p>
							) : null}
						</div>
					</div>
					<button
						type="button"
						autoFocus
						className="shrink-0 rounded border border-neutral-700 px-3 py-2 text-sm text-neutral-200 hover:border-neutral-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--embed-accent)]"
						onClick={onClose}
					>
						Close details
					</button>
				</div>
				{fields.has("bio") && speaker.bio ? <p className="mt-5 whitespace-pre-wrap text-sm leading-6 text-neutral-300">{speaker.bio}</p> : null}
				{speaker.sessions.length > 0 ? (
					<div className="mt-6">
						<h3 className="text-xs font-medium uppercase tracking-wide text-neutral-500">Sessions ({speaker.sessions.length})</h3>
						<ul className="mt-3 space-y-3">
							{speaker.sessions.map((session) => (
								<li key={session.id} className="rounded-lg border border-neutral-800 bg-neutral-900/50 p-3">
									<Link className="font-medium text-neutral-100 hover:underline" href={session.url} target="_blank">{session.title}</Link>
									<p className="mt-1 text-xs text-neutral-500">{formatDateTime(session.startsAt, payload.event.timezone)}–{formatTime(session.endsAt, payload.event.timezone)} · {session.room}</p>
								</li>
							))}
						</ul>
					</div>
				) : null}
				<Link className="mt-6 inline-block text-sm font-medium text-[var(--embed-accent)] hover:underline" href={speaker.url} target="_blank">
					View full speaker profile
				</Link>
			</section>
		</div>
	);
}

export function SpeakersWidget({ payload, gallery }: { payload: PublicEmbedPayload; gallery: boolean }) {
	const [query, setQuery] = useState("");
	const [selectedSpeaker, setSelectedSpeaker] = useState<Speaker | null>(null);
	const detailButtons = useRef(new Map<string, HTMLButtonElement>());
	const speakers = payload.speakers.filter((speaker) => speaker.name.toLowerCase().includes(query.trim().toLowerCase()));
	const closeDetails = () => {
		const speakerId = selectedSpeaker?.id;
		setSelectedSpeaker(null);
		if (speakerId) queueMicrotask(() => detailButtons.current.get(speakerId)?.focus());
	};
	return (
		<section className="mt-6">
		<div inert={selectedSpeaker ? true : undefined} aria-hidden={selectedSpeaker ? true : undefined}>
		<label className="block max-w-md text-xs font-medium text-neutral-400">
			Search speakers by name
			<input
				type="search"
				value={query}
				onChange={(event) => setQuery(event.target.value)}
				placeholder="Speaker name"
				className="mt-1 w-full rounded border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-100"
			/>
		</label>
		<p className="mt-4 text-sm text-neutral-400" aria-live="polite">{countLabel(speakers.length, "speaker")}</p>
		<ul className={gallery ? "mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3" : "mt-3 divide-y divide-neutral-800"}>
			{speakers.map((speaker) => (
				<li key={speaker.id}>
					<SpeakerCard
						payload={payload}
						speaker={speaker}
						gallery={gallery}
						onOpenDetails={gallery ? () => setSelectedSpeaker(speaker) : undefined}
						detailsButtonRef={gallery ? (element) => {
							if (element) detailButtons.current.set(speaker.id, element);
							else detailButtons.current.delete(speaker.id);
						} : undefined}
					/>
				</li>
			))}
		</ul>
		</div>
		{gallery && selectedSpeaker ? <SpeakerDetailDialog payload={payload} speaker={selectedSpeaker} onClose={closeDetails} /> : null}
	</section>
	);
}

function useSessionDays(payload: PublicEmbedPayload) {
	return useMemo(() => {
		const grouped = new Map<string, { label: string; sessions: Session[] }>();
		for (const session of [...payload.sessions].sort((a, b) => a.startsAt - b.startsAt)) {
			const key = dayKey(session.startsAt, payload.event.timezone);
			const existing = grouped.get(key) ?? { label: dayLabel(session.startsAt, payload.event.timezone), sessions: [] };
			existing.sessions.push(session);
			grouped.set(key, existing);
		}
		return [...grouped.entries()].map(([key, value]) => ({ key, ...value }));
	}, [payload.event.timezone, payload.sessions]);
}

function DayNavigation({ days, activeDay, onChange }: { days: Array<{ key: string; label: string }>; activeDay: string; onChange: (day: string) => void }) {
	return (
		<nav className="mt-6 flex flex-wrap gap-2" aria-label="Event days">
			{days.map((day) => (
				<button
					key={day.key}
					type="button"
					aria-pressed={day.key === activeDay}
					onClick={() => onChange(day.key)}
					className={day.key === activeDay ? "rounded bg-[var(--embed-accent)] px-3 py-2 text-sm font-medium text-white" : "rounded border border-neutral-700 px-3 py-2 text-sm text-neutral-300"}
				>
					{day.label}
				</button>
			))}
		</nav>
	);
}

function AgendaDetail({ payload, session, onClose }: { payload: PublicEmbedPayload; session: Session; onClose: () => void }) {
	const fields = new Set(payload.embed.config.visibleFields);
	const taxonomy = [
		fields.has("format") ? `Format: ${session.format}` : null,
		fields.has("track") ? `Track: ${session.track}` : null,
	].filter(Boolean).join(" · ");
	return (
		<aside className="mt-6 rounded-lg border border-[var(--embed-accent)] bg-neutral-900 p-5" aria-label={`${session.title} details`}>
			<div className="flex items-start justify-between gap-4">
				<div>
					{fields.has("time") ? <p className="font-mono text-xs text-neutral-400">{formatDateTime(session.startsAt, payload.event.timezone)}–{formatTime(session.endsAt, payload.event.timezone)}</p> : null}
					{fields.has("title") ? <h2 className="mt-1 text-xl font-semibold text-neutral-100">{session.title}</h2> : null}
				</div>
				<button type="button" className="rounded border border-neutral-700 px-3 py-1 text-sm" onClick={onClose}>Close details</button>
			</div>
			{fields.has("room") ? <p className="mt-3 text-sm text-neutral-300">Room: {session.room}</p> : null}
			{taxonomy ? <p className="mt-1 text-sm text-neutral-300">{taxonomy}</p> : null}
			{fields.has("abstract") && session.abstract ? <p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-neutral-400">{session.abstract}</p> : null}
			<SessionSpeakerList session={session} fields={fields} className="mt-4" />
			<Link className="mt-4 inline-block text-sm font-medium text-[var(--embed-accent)] hover:underline" href={session.url} target="_blank">View full session</Link>
		</aside>
	);
}

export function AgendaWidget({ payload }: { payload: PublicEmbedPayload }) {
	const days = useSessionDays(payload);
	const fields = new Set(payload.embed.config.visibleFields);
	const [activeDay, setActiveDay] = useState(days[0]?.key ?? "");
	const [selectedSession, setSelectedSession] = useState<Session | null>(null);
	const sessions = days.find((day) => day.key === activeDay)?.sessions ?? [];
	return (
		<section className="mt-6">
		<DayNavigation days={days} activeDay={activeDay} onChange={(day) => { setActiveDay(day); setSelectedSession(null); }} />
		<div className="mt-5 space-y-4">
			{sessions.map((session) => {
				const metadata = [
					fields.has("room") ? session.room : null,
					fields.has("track") ? session.track : null,
					fields.has("format") ? session.format : null,
				].filter(Boolean).join(" · ");
				return (
					<div key={session.id} className={fields.has("time") ? "grid gap-3 sm:grid-cols-[7rem_1fr]" : ""}>
						{fields.has("time") ? <time className="pt-3 font-mono text-xs text-neutral-500">{formatTime(session.startsAt, payload.event.timezone)}</time> : null}
						<div className="rounded-lg border border-neutral-800 bg-neutral-900/40 p-4">
							<button type="button" aria-label={`Open details for ${session.title}`} onClick={() => setSelectedSession(session)} className="block w-full text-left hover:text-neutral-200">
								{fields.has("title") ? <span className="font-semibold text-neutral-100">{session.title}</span> : null}
								{metadata ? <span className="mt-1 block text-sm text-neutral-400">{metadata}</span> : null}
							</button>
							<SessionSpeakerList session={session} fields={fields} className="mt-3" />
						</div>
					</div>
				);
			})}
		</div>
		{selectedSession ? <AgendaDetail payload={payload} session={selectedSession} onClose={() => setSelectedSession(null)} /> : null}
	</section>
	);
}

export function ItineraryWidget({ payload }: { payload: PublicEmbedPayload }) {
	const days = useSessionDays(payload);
	const [activeDay, setActiveDay] = useState(days[0]?.key ?? "");
	const sessions = days.find((day) => day.key === activeDay)?.sessions ?? [];
	return (
		<section className="mt-6">
		<div className="flex flex-wrap items-end justify-between gap-4">
			<div>
				<h2 className="text-xl font-semibold text-neutral-100">Browse the itinerary</h2>
				<p className="mt-1 text-sm text-neutral-400">Sessions are ordered by start time for each event day.</p>
			</div>
			<Link className="rounded bg-[var(--embed-accent)] px-4 py-2 text-sm font-medium text-white" href={payload.itineraryUrl} target="_blank">Open filtered full itinerary</Link>
		</div>
		<DayNavigation days={days} activeDay={activeDay} onChange={setActiveDay} />
		<ul className="mt-5 space-y-4">
			{sessions.map((session) => (
				<li key={session.id}><SessionCard payload={payload} session={session} /></li>
			))}
		</ul>
	</section>
	);
}
