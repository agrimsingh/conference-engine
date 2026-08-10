"use client";

import { useMemo, useState } from "react";
import { buttonClasses, INPUT_CLASSES, noticeClasses } from "@/components/ui";
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
type EmbedPanel = "create" | "preview";

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

const PANELS: Array<{ id: EmbedPanel; label: string; description: string }> = [
	{
		id: "create",
		label: "New widget",
		description: "Name, filters, and which fields the public widget shows.",
	},
	{
		id: "preview",
		label: "Preview & snippets",
		description: "Live preview plus share URL, script, and data endpoints.",
	},
];

function split(value: string): string[] {
	return value
		.split(",")
		.map((item) => item.trim())
		.filter(Boolean);
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
	const [panel, setPanel] = useState<EmbedPanel>(
		initialEmbeds.length > 0 ? "preview" : "create",
	);
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
	const [visibleFields, setVisibleFields] = useState<EmbedVisibleField[]>(
		defaultVisibleFields("sessions"),
	);
	const [message, setMessage] = useState<{
		kind: "positive" | "negative";
		text: string;
	} | null>(null);
	const [saving, setSaving] = useState(false);

	const activePanel = PANELS.find((item) => item.id === panel) ?? PANELS[0]!;

	function selectWidget(nextWidget: EmbedWidgetType) {
		setWidgetType(nextWidget);
		setVisibleFields(defaultVisibleFields(nextWidget));
		const label =
			WIDGETS.find((item) => item.value === nextWidget)?.label ?? "Event widget";
		setName(label);
		setSlug(nextWidget.replaceAll("_", "-"));
	}

	async function create() {
		setSaving(true);
		setMessage(null);
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
			const body = (await response.json()) as {
				ok: boolean;
				embed?: EmbedView;
				error?: string;
			};
			if (!response.ok || !body.embed) throw new Error(body.error ?? "Create failed");
			setEmbeds((current) => [body.embed!, ...current]);
			setSelectedId(body.embed.id);
			setPanel("preview");
			setMessage({
				kind: "positive",
				text: "Embed created. Preview and snippets are live.",
			});
		} catch (error) {
			setMessage({
				kind: "negative",
				text: error instanceof Error ? error.message : "Create failed",
			});
		} finally {
			setSaving(false);
		}
	}

	return (
		<div className="mt-8 lg:grid lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-8">
			<aside className="mb-6 lg:mb-0">
				<label className="mb-2 block text-xs font-medium uppercase tracking-wide text-neutral-500 lg:hidden">
					Embeds section
					<select
						value={panel}
						onChange={(event) => setPanel(event.target.value as EmbedPanel)}
						className={`mt-1.5 w-full ${INPUT_CLASSES}`}
					>
						{PANELS.map((item) => (
							<option key={item.id} value={item.id}>
								{item.label}
							</option>
						))}
					</select>
				</label>
				<nav aria-label="Embed sections" className="hidden lg:sticky lg:top-20 lg:block">
					<ul className="space-y-1 border-l border-neutral-800">
						{PANELS.map((item) => {
							const selectedPanel = item.id === panel;
							return (
								<li key={item.id}>
									<button
										type="button"
										onClick={() => setPanel(item.id)}
										aria-current={selectedPanel ? "page" : undefined}
										className={
											selectedPanel
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
				{message ? (
					<p role="status" className={noticeClasses(message.kind)}>
						{message.text}
					</p>
				) : null}

				<header className="mb-2 border-b border-neutral-800 pb-4">
					<h2 className="text-lg font-semibold text-neutral-100">{activePanel.label}</h2>
					<p className="mt-1 text-sm text-neutral-400">{activePanel.description}</p>
				</header>

				{panel === "create" ? (
					<div className="space-y-6">
						<div className="grid gap-4 sm:grid-cols-2">
							<label className="text-sm text-neutral-300">
								Name
								<input
									className={`mt-1 w-full ${INPUT_CLASSES}`}
									value={name}
									onChange={(event) => setName(event.target.value)}
								/>
							</label>
							<label className="text-sm text-neutral-300">
								URL slug
								<input
									className={`mt-1 w-full ${INPUT_CLASSES}`}
									value={slug}
									onChange={(event) => setSlug(event.target.value)}
								/>
							</label>
							<label className="text-sm text-neutral-300">
								Widget type
								<select
									className={`mt-1 w-full ${INPUT_CLASSES}`}
									value={widgetType}
									onChange={(event) =>
										selectWidget(event.target.value as EmbedWidgetType)
									}
								>
									{WIDGETS.map((item) => (
										<option key={item.value} value={item.value}>
											{item.label}
										</option>
									))}
								</select>
							</label>
							<label className="text-sm text-neutral-300">
								Brand color
								<input
									aria-label="Brand color"
									type="color"
									className="mt-1 h-10 w-full rounded-md border border-neutral-700 bg-neutral-900"
									value={brandColor}
									onChange={(event) => setBrandColor(event.target.value)}
								/>
							</label>
						</div>

						<div className="border-t border-neutral-800 pt-6">
							<p className="text-sm font-medium text-neutral-200">Limit to tracks</p>
							<p className="mt-1 text-xs text-neutral-500">
								Leave every track unchecked to include all tracks.
							</p>
							{trackOptions.length === 0 ? (
								<p className="mt-3 text-sm text-neutral-500">No tracks configured yet.</p>
							) : (
								<ul className="mt-3 divide-y divide-neutral-800 border-t border-neutral-800">
									{trackOptions.map((track) => (
										<li key={track.id}>
											<label className="flex cursor-pointer items-center gap-3 py-2.5 text-sm text-neutral-300">
												<input
													type="checkbox"
													checked={trackIds.includes(track.id)}
													onChange={(event) =>
														setTrackIds((current) =>
															event.target.checked
																? [...current, track.id]
																: current.filter((id) => id !== track.id),
														)
													}
												/>
												{track.name}
											</label>
										</li>
									))}
								</ul>
							)}
						</div>

						<div className="grid gap-4 border-t border-neutral-800 pt-6 sm:grid-cols-2">
							<label className="text-sm text-neutral-300">
								Formats
								<input
									placeholder="Talk, Workshop"
									className={`mt-1 w-full ${INPUT_CLASSES}`}
									value={formats}
									onChange={(event) => setFormats(event.target.value)}
								/>
								<span className="mt-1 block text-xs text-neutral-500">
									Comma-separated. Leave blank for all formats.
								</span>
							</label>
							<label className="text-sm text-neutral-300">
								Rooms
								<input
									placeholder="Main Hall"
									className={`mt-1 w-full ${INPUT_CLASSES}`}
									value={rooms}
									onChange={(event) => setRooms(event.target.value)}
								/>
								<span className="mt-1 block text-xs text-neutral-500">
									Comma-separated. Leave blank for all rooms.
								</span>
							</label>
						</div>

						<div className="border-t border-neutral-800 pt-6">
							<p className="text-sm font-medium text-neutral-200">Visible fields</p>
							<ul className="mt-3 grid gap-x-6 sm:grid-cols-2">
								{FIELDS.map((field) => (
									<li key={field.value}>
										<label className="flex cursor-pointer items-center gap-3 border-t border-neutral-800 py-2.5 text-sm text-neutral-300">
											<input
												type="checkbox"
												checked={visibleFields.includes(field.value)}
												onChange={(event) =>
													setVisibleFields((current) =>
														event.target.checked
															? [...current, field.value]
															: current.filter((item) => item !== field.value),
													)
												}
											/>
											{field.label}
										</label>
									</li>
								))}
							</ul>
						</div>

						<button
							type="button"
							disabled={saving}
							onClick={() => void create()}
							className={buttonClasses("primary")}
						>
							{saving ? "Creating…" : "Create embed"}
						</button>
					</div>
				) : null}

				{panel === "preview" ? (
					<div className="space-y-4">
						<label className="block text-sm text-neutral-300">
							Generated embed
							<select
								className={`mt-1 w-full ${INPUT_CLASSES}`}
								value={selectedId}
								onChange={(event) => setSelectedId(event.target.value)}
							>
								<option value="">Select an embed</option>
								{embeds.map((embed) => (
									<option key={embed.id} value={embed.id}>
										{embed.name}
									</option>
								))}
							</select>
						</label>
						{selected ? (
							<>
								<iframe
									title={`${selected.name} preview`}
									src={selected.urls.shareUrl}
									className="h-80 w-full border border-neutral-800 bg-neutral-950"
									sandbox="allow-scripts allow-same-origin allow-popups"
								/>
								<div className="grid gap-4 border-t border-neutral-800 pt-4">
									<Output
										label="Script tag / custom element"
										value={selected.urls.scriptSnippet}
										tall
									/>
									<Output label="Iframe snippet" value={selected.urls.iframeSnippet} tall />
									<Output label="Share URL" value={selected.urls.shareUrl} />
									<Output label="JSON endpoint" value={selected.urls.jsonUrl} />
									<Output label="HTML endpoint" value={selected.urls.htmlUrl} />
									<Output label="XML endpoint" value={selected.urls.xmlUrl} />
									{["agenda", "sessions", "itinerary"].includes(selected.widget_type) ? (
										<Output label="iCal endpoint" value={selected.urls.icalUrl} />
									) : null}
								</div>
							</>
						) : (
							<p className="border-t border-dashed border-neutral-800 py-8 text-sm text-neutral-500">
								Create or select an embed to preview its public output.
							</p>
						)}
					</div>
				) : null}
			</div>
		</div>
	);
}

function Output({
	label,
	value,
	tall = false,
}: {
	label: string;
	value: string;
	tall?: boolean;
}) {
	return (
		<label className="block text-xs font-medium uppercase tracking-wide text-neutral-500">
			{label}
			<textarea
				readOnly
				value={value}
				rows={tall ? 4 : 2}
				className={`mt-1 w-full font-mono text-xs normal-case text-neutral-300 ${INPUT_CLASSES}`}
			/>
		</label>
	);
}
