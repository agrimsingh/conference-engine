"use client";

import { useMemo, useState } from "react";
import {
	defaultVisibleFields,
	type EmbedDefinition,
	type EmbedVisibleField,
	type EmbedWidgetType,
} from "@/lib/embeds/embed";

type EmbedUrls = {
	shareUrl: string;
	jsonUrl: string;
	icalUrl: string;
	htmlUrl: string;
	xmlUrl: string;
	loaderUrl: string;
	iframeSnippet: string;
	scriptSnippet: string;
};
type EmbedView = EmbedDefinition & { urls: EmbedUrls };
type TrackOption = { id: string; name: string };

const WIDGETS: Array<{ value: EmbedWidgetType; label: string }> = [
	{ value: "sessions", label: "Sessions list" },
	{ value: "speakers", label: "Speakers list" },
	{ value: "agenda", label: "Agenda" },
	{ value: "itinerary", label: "Schedule itinerary" },
	{ value: "speaker_gallery", label: "Speaker gallery" },
];
const FIELDS: Array<{ value: EmbedVisibleField; label: string }> = [
	{ value: "title", label: "Title" },
	{ value: "time", label: "Date and time" },
	{ value: "room", label: "Room" },
	{ value: "track", label: "Track" },
	{ value: "speakers", label: "Speakers" },
	{ value: "abstract", label: "Description" },
	{ value: "format", label: "Format" },
	{ value: "bio", label: "Speaker bio" },
	{ value: "jobTitle", label: "Job title" },
	{ value: "company", label: "Company" },
	{ value: "headshot", label: "Headshot" },
];

function split(value: string): string[] {
	return value.split(",").map((item) => item.trim()).filter(Boolean);
}

export function EmbedBuilder({
	eventSlug,
	initialEmbeds,
	trackOptions,
}: {
	eventSlug: string;
	initialEmbeds: EmbedView[];
	trackOptions: TrackOption[];
}) {
	const [embeds, setEmbeds] = useState(initialEmbeds);
	const [selectedId, setSelectedId] = useState(initialEmbeds[0]?.id ?? "");
	const selected = useMemo(
		() => embeds.find((embed) => embed.id === selectedId) ?? null,
		[embeds, selectedId],
	);
	const [name, setName] = useState("Sessions list");
	const [slug, setSlug] = useState("sessions-list");
	const [widgetType, setWidgetType] = useState<EmbedWidgetType>("sessions");
	const [brandColor, setBrandColor] = useState("#2563eb");
	const [trackIds, setTrackIds] = useState<string[]>([]);
	const [formats, setFormats] = useState("");
	const [rooms, setRooms] = useState("");
	const [visibleFields, setVisibleFields] = useState<EmbedVisibleField[]>(defaultVisibleFields("sessions"));
	const [message, setMessage] = useState("");
	const [saving, setSaving] = useState(false);

	function selectWidget(nextWidget: EmbedWidgetType) {
		setWidgetType(nextWidget);
		setVisibleFields(defaultVisibleFields(nextWidget));
		const label = WIDGETS.find((item) => item.value === nextWidget)?.label ?? "Event widget";
		setName(label);
		setSlug(nextWidget.replaceAll("_", "-"));
	}

	async function create() {
		setSaving(true);
		setMessage("");
		try {
			const response = await fetch(`/api/admin/events/${eventSlug}/embeds`, {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({
					name,
					slug,
					widgetType,
					brandColor,
					trackIds,
					formats: split(formats),
					rooms: split(rooms),
					visibleFields,
				}),
			});
			const body = await response.json() as { ok: boolean; embed?: EmbedView; error?: string };
			if (!response.ok || !body.embed) throw new Error(body.error ?? "Create failed");
			setEmbeds((current) => [body.embed!, ...current]);
			setSelectedId(body.embed.id);
			setMessage("Embed created. The preview and snippets below are live.");
		} catch (error) {
			setMessage(error instanceof Error ? error.message : "Create failed");
		} finally {
			setSaving(false);
		}
	}

	return (
		<div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
			<section className="space-y-4 rounded-lg border border-neutral-800 bg-neutral-900/50 p-5">
				<h2 className="text-lg font-semibold text-neutral-100">New widget</h2>
				<label className="block text-sm">
					Name
					<input className="mt-1 w-full rounded border border-neutral-700 bg-neutral-950 px-3 py-2" value={name} onChange={(event) => setName(event.target.value)} />
				</label>
				<label className="block text-sm">
					URL slug
					<input className="mt-1 w-full rounded border border-neutral-700 bg-neutral-950 px-3 py-2" value={slug} onChange={(event) => setSlug(event.target.value)} />
				</label>
				<label className="block text-sm">
					Widget type
					<select className="mt-1 w-full rounded border border-neutral-700 bg-neutral-950 px-3 py-2" value={widgetType} onChange={(event) => selectWidget(event.target.value as EmbedWidgetType)}>
						{WIDGETS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
					</select>
				</label>
				<label className="block text-sm">
					Brand color
					<input aria-label="Brand color" type="color" className="mt-1 h-10 w-full rounded border border-neutral-700 bg-neutral-950" value={brandColor} onChange={(event) => setBrandColor(event.target.value)} />
				</label>
				<fieldset>
					<legend className="text-sm">Limit to tracks</legend>
					<p className="mt-1 text-xs text-neutral-500">Leave every track unchecked to include all tracks.</p>
					<div className="mt-2 flex flex-wrap gap-2">
						{trackOptions.map((track) => (
							<label key={track.id} className="rounded border border-neutral-700 px-2 py-1 text-xs">
								<input
									type="checkbox"
									className="mr-1"
									checked={trackIds.includes(track.id)}
									onChange={(event) => setTrackIds((current) => event.target.checked ? [...current, track.id] : current.filter((id) => id !== track.id))}
								/>
								{track.name}
							</label>
						))}
					</div>
				</fieldset>
				<div className="grid gap-3 sm:grid-cols-2">
					<label className="text-sm">
						Formats
						<input placeholder="Talk, Workshop" className="mt-1 w-full rounded border border-neutral-700 bg-neutral-950 px-2 py-2" value={formats} onChange={(event) => setFormats(event.target.value)} />
					</label>
					<label className="text-sm">
						Rooms
						<input placeholder="Main Hall" className="mt-1 w-full rounded border border-neutral-700 bg-neutral-950 px-2 py-2" value={rooms} onChange={(event) => setRooms(event.target.value)} />
					</label>
				</div>
				<fieldset>
					<legend className="text-sm">Visible fields</legend>
					<div className="mt-2 flex flex-wrap gap-2">
						{FIELDS.map((field) => (
							<label key={field.value} className="rounded border border-neutral-700 px-2 py-1 text-xs">
								<input
									type="checkbox"
									className="mr-1"
									checked={visibleFields.includes(field.value)}
									onChange={(event) => setVisibleFields((current) => event.target.checked ? [...current, field.value] : current.filter((item) => item !== field.value))}
								/>
								{field.label}
							</label>
						))}
					</div>
				</fieldset>
				<button type="button" disabled={saving} onClick={create} className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
					{saving ? "Creating…" : "Create embed"}
				</button>
				{message ? <p role="status" className="text-sm text-neutral-300">{message}</p> : null}
			</section>
			<section className="min-w-0 space-y-4">
				<label className="block text-sm">
					Generated embed
					<select className="mt-1 w-full rounded border border-neutral-700 bg-neutral-950 px-3 py-2" value={selectedId} onChange={(event) => setSelectedId(event.target.value)}>
						<option value="">Select an embed</option>
						{embeds.map((embed) => <option key={embed.id} value={embed.id}>{embed.name}</option>)}
					</select>
				</label>
				{selected ? (
					<>
						<iframe title={`${selected.name} preview`} src={selected.urls.shareUrl} className="h-80 w-full rounded border border-neutral-800 bg-neutral-950" sandbox="allow-scripts allow-same-origin allow-popups" />
						<Output label="Script tag / custom element" value={selected.urls.scriptSnippet} tall />
						<Output label="Iframe snippet" value={selected.urls.iframeSnippet} tall />
						<Output label="Share URL" value={selected.urls.shareUrl} />
						<Output label="JSON endpoint" value={selected.urls.jsonUrl} />
						<Output label="HTML endpoint" value={selected.urls.htmlUrl} />
						<Output label="XML endpoint" value={selected.urls.xmlUrl} />
						{["agenda", "sessions", "itinerary"].includes(selected.widget_type) ? <Output label="iCal endpoint" value={selected.urls.icalUrl} /> : null}
					</>
				) : (
					<p className="rounded border border-dashed border-neutral-800 p-8 text-sm text-neutral-500">Create or select an embed to preview its public output.</p>
				)}
			</section>
		</div>
	);
}

function Output({ label, value, tall = false }: { label: string; value: string; tall?: boolean }) {
	return (
		<label className="block text-xs font-medium uppercase tracking-wide text-neutral-500">
			{label}
			<textarea readOnly value={value} rows={tall ? 4 : 2} className="mt-1 w-full rounded border border-neutral-800 bg-neutral-950 p-2 font-mono text-xs normal-case text-neutral-300" />
		</label>
	);
}
