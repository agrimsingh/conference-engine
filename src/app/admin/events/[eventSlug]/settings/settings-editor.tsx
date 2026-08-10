"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo, useState, type InputHTMLAttributes, type ReactNode } from "react";
import { TimezoneSelect } from "@/components/timezone-select";
import { buttonClasses, INPUT_CLASSES, noticeClasses } from "@/components/ui";
import type { EventConfiguration } from "@/lib/events/configuration";
import type { TaskFormField, TaskFormFieldType } from "@/lib/speakers/task-forms";

type Props = { eventSlug: string; configuration: EventConfiguration };
type Message = { kind: "positive" | "negative"; text: string } | null;
type SectionId = "details" | "rooms" | "tracks" | "tasks";

const SECTIONS: Array<{
	id: SectionId;
	label: string;
	description: string;
}> = [
	{
		id: "details",
		label: "Event details",
		description: "Name, dates, timezone, and schedule defaults.",
	},
	{
		id: "rooms",
		label: "Rooms",
		description: "Rooms appear as schedule columns.",
	},
	{
		id: "tracks",
		label: "Agenda tracks",
		description: "Tracks group sessions within your agenda.",
	},
	{
		id: "tasks",
		label: "Speaker tasks",
		description: "Templates copied onto accepted speakers.",
	},
];

function timeValue(minutes: number) {
	return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

function minutes(value: FormDataEntryValue | null) {
	const match = /^(\d{2}):(\d{2})$/.exec(String(value ?? ""));
	return match ? Number(match[1]) * 60 + Number(match[2]) : Number.NaN;
}

function dueLocalValue(dueAt: number | null) {
	if (dueAt == null) return "";
	const date = new Date(dueAt);
	if (Number.isNaN(date.getTime())) return "";
	const pad = (value: number) => String(value).padStart(2, "0");
	return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function parseSection(value: string | null): SectionId {
	switch (value) {
		case "rooms":
		case "tracks":
		case "tasks":
		case "details":
			return value;
		default:
			return "details";
	}
}

export function SettingsEditor({ eventSlug, configuration }: Props) {
	const router = useRouter();
	const searchParams = useSearchParams();
	const section = parseSection(searchParams.get("section"));
	const [message, setMessage] = useState<Message>(null);
	const [pending, setPending] = useState(false);
	const event = configuration.event;
	const active = useMemo(
		() => SECTIONS.find((item) => item.id === section) ?? SECTIONS[0]!,
		[section],
	);

	const setSection = useCallback(
		(next: SectionId) => {
			const params = new URLSearchParams(searchParams.toString());
			if (next === "details") params.delete("section");
			else params.set("section", next);
			const query = params.toString();
			router.replace(
				query
					? `/admin/events/${eventSlug}/settings?${query}`
					: `/admin/events/${eventSlug}/settings`,
				{ scroll: false },
			);
		},
		[eventSlug, router, searchParams],
	);

	async function request(path: string, method: string, body: unknown) {
		setPending(true);
		setMessage(null);
		try {
			const response = await fetch(`/api/admin/events/${eventSlug}/settings${path}`, {
				method,
				headers: { "content-type": "application/json" },
				body: JSON.stringify(body),
			});
			const data = (await response.json()) as { ok?: boolean; error?: string };
			if (!response.ok || !data.ok) {
				setMessage({ kind: "negative", text: data.error ?? "Could not save changes." });
				return false;
			}
			setMessage({ kind: "positive", text: "Saved." });
			router.refresh();
			return true;
		} catch {
			setMessage({ kind: "negative", text: "Network error. Your changes were not saved." });
			return false;
		} finally {
			setPending(false);
		}
	}

	function move(kind: "rooms" | "tracks" | "tasks", ids: string[], index: number, delta: number) {
		const next = index + delta;
		if (next < 0 || next >= ids.length) return;
		const ordered = [...ids];
		[ordered[index], ordered[next]] = [ordered[next]!, ordered[index]!];
		void request(`/${kind}`, "PATCH", { action: "reorder", orderedIds: ordered });
	}

	return (
		<div className="mt-8 lg:grid lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-8">
			<aside className="mb-6 lg:mb-0">
				<label className="mb-2 block text-xs font-medium uppercase tracking-wide text-neutral-500 lg:hidden">
					Settings section
					<select
						value={section}
						onChange={(event) => setSection(parseSection(event.target.value))}
						className={`mt-1.5 w-full ${INPUT_CLASSES}`}
					>
						{SECTIONS.map((item) => (
							<option key={item.id} value={item.id}>
								{item.label}
							</option>
						))}
					</select>
				</label>
				<nav
					aria-label="Settings sections"
					className="hidden lg:sticky lg:top-20 lg:block"
				>
					<ul className="space-y-1 border-l border-neutral-800">
						{SECTIONS.map((item) => {
							const selected = item.id === section;
							return (
								<li key={item.id}>
									<button
										type="button"
										onClick={() => setSection(item.id)}
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
				{message ? (
					<p aria-live="polite" className={noticeClasses(message.kind)}>
						{message.text}
					</p>
				) : null}

				<section className="rounded-lg border border-neutral-800 bg-neutral-900 p-5">
					<header className="border-b border-neutral-800 pb-4">
						<h2 className="text-lg font-semibold text-neutral-100">{active.label}</h2>
						<p className="mt-1 text-sm text-neutral-400">{active.description}</p>
					</header>

					<div className="mt-5">
						{section === "details" ? (
							<form
								className="grid gap-4 sm:grid-cols-2"
								onSubmit={(e) => {
									e.preventDefault();
									const f = new FormData(e.currentTarget);
									void request("", "PATCH", {
										name: f.get("name"),
										startDay: f.get("startDay"),
										endDay: f.get("endDay"),
										timezone: f.get("timezone"),
										dayStartMinutes: minutes(f.get("dayStart")),
										dayEndMinutes: minutes(f.get("dayEnd")),
										slotDurationMinutes: Number(f.get("slotDuration")),
										trackConflictPolicy: f.get("trackConflictPolicy"),
										notifyOnSubmissionCreate: f.get("notifyOnSubmissionCreate") === "on",
										notifyOnSubmissionUpdate: f.get("notifyOnSubmissionUpdate") === "on",
									});
								}}
							>
								<p className="sm:col-span-2 text-sm text-neutral-500">
									The slug is permanent. Changes that would put an existing session outside these dates or hours are rejected.
								</p>
								<Field label="Event name" name="name" defaultValue={event.name} />
								<label className="block space-y-1.5 text-sm">
									<span className="font-medium text-neutral-200">Timezone</span>
									<TimezoneSelect name="timezone" required defaultValue={event.timezone} />
								</label>
								<Field
									label="Start date"
									name="startDay"
									type="date"
									defaultValue={event.start_day ?? ""}
								/>
								<Field
									label="End date"
									name="endDay"
									type="date"
									defaultValue={event.end_day ?? ""}
								/>
								<Field
									label="Day starts"
									name="dayStart"
									type="time"
									defaultValue={timeValue(event.day_start_minutes)}
								/>
								<Field
									label="Day ends"
									name="dayEnd"
									type="time"
									defaultValue={timeValue(event.day_end_minutes)}
								/>
								<label className="block space-y-1.5 text-sm">
									<span className="font-medium text-neutral-200">Slot duration</span>
									<select
										name="slotDuration"
										defaultValue={String(event.slot_duration_minutes)}
										className={`w-full ${INPUT_CLASSES}`}
									>
										<option value="15">15 minutes</option>
										<option value="20">20 minutes</option>
										<option value="30">30 minutes</option>
										<option value="45">45 minutes</option>
										<option value="60">60 minutes</option>
										<option value="90">90 minutes</option>
										<option value="120">120 minutes</option>
									</select>
								</label>
								<label className="block space-y-1.5 text-sm">
									<span className="font-medium text-neutral-200">Track conflict policy</span>
									<select
										name="trackConflictPolicy"
										defaultValue={event.track_conflict_policy}
										className={`w-full ${INPUT_CLASSES}`}
									>
										<option value="hard">Hard: block overlapping sessions in the same track</option>
										<option value="allow">Allow: permit overlapping sessions in the same track</option>
									</select>
								</label>
								<fieldset className="space-y-2 rounded-md border border-neutral-800 p-3 sm:col-span-2">
									<legend className="px-1 text-sm font-medium text-neutral-200">
										Organizer submission emails
									</legend>
									<p className="text-xs text-neutral-500">
										Every event member gets these when enabled. Draft autosaves never trigger them.
									</p>
									<label className="flex items-center gap-2 text-sm text-neutral-200">
										<input
											name="notifyOnSubmissionCreate"
											type="checkbox"
											defaultChecked={event.notify_on_submission_create === 1}
										/>
										Email organizers on new submissions
									</label>
									<label className="flex items-center gap-2 text-sm text-neutral-200">
										<input
											name="notifyOnSubmissionUpdate"
											type="checkbox"
											defaultChecked={event.notify_on_submission_update === 1}
										/>
										Email organizers when a submission is updated
									</label>
								</fieldset>
								<div className="sm:col-span-2">
									<button disabled={pending} className={buttonClasses("primary")}>
										Save event details
									</button>
								</div>
							</form>
						) : null}

						{section === "rooms" ? (
							<div className="space-y-4">
								<form
									className="flex flex-wrap gap-2"
									onSubmit={(e) => {
										e.preventDefault();
										const f = new FormData(e.currentTarget);
										void request("/rooms", "POST", { name: f.get("name") });
										e.currentTarget.reset();
									}}
								>
									<Field label="New room name" name="name" />
									<button disabled={pending} className={`self-end ${buttonClasses("secondary")}`}>
										Add room
									</button>
								</form>
								<Rows
									rows={configuration.rooms}
									pending={pending}
									onMove={(index, delta) =>
										move(
											"rooms",
											configuration.rooms.map((item) => item.id),
											index,
											delta,
										)
									}
									onSave={(id, data) => request("/rooms", "PATCH", { id, ...data })}
									onDelete={(id) => request("/rooms", "DELETE", { id })}
									render={(row) => <Field label="Room name" name="name" defaultValue={row.name} />}
								/>
							</div>
						) : null}

						{section === "tracks" ? (
							<div className="space-y-4">
								<form
									className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]"
									onSubmit={(e) => {
										e.preventDefault();
										const f = new FormData(e.currentTarget);
										void request("/tracks", "POST", {
											name: f.get("name"),
											slug: f.get("slug"),
										});
										e.currentTarget.reset();
									}}
								>
									<Field label="Track name" name="name" />
									<Field
										label="Track slug"
										name="slug"
										placeholder="workshops"
										pattern="(?:[a-z0-9]|-)+"
									/>
									<button
										disabled={pending}
										className={`self-end ${buttonClasses("secondary")}`}
									>
										Add track
									</button>
								</form>
								<Rows
									rows={configuration.tracks}
									pending={pending}
									onMove={(index, delta) =>
										move(
											"tracks",
											configuration.tracks.map((item) => item.id),
											index,
											delta,
										)
									}
									onSave={(id, data) => request("/tracks", "PATCH", { id, ...data })}
									onDelete={(id) => request("/tracks", "DELETE", { id })}
									render={(row) => (
										<>
											<Field label="Track name" name="name" defaultValue={row.name} />
											<Field
												label="Track slug"
												name="slug"
												defaultValue={row.slug}
												pattern="(?:[a-z0-9]|-)+"
											/>
										</>
									)}
								/>
							</div>
						) : null}

						{section === "tasks" ? (
							<div className="space-y-4">
								<form
									className="grid gap-2 sm:grid-cols-2"
									onSubmit={(e) => {
										e.preventDefault();
										const f = new FormData(e.currentTarget);
										void request("/tasks", "POST", {
											key: f.get("key"),
											label: f.get("label"),
											kind: f.get("kind"),
											formSchema: f.get("formSchema"),
											required: f.get("required") === "on",
											instructions: f.get("instructions"),
											dueAt: f.get("dueAt"),
										});
									}}
								>
									<Field
										label="Task key"
										name="key"
										placeholder="travel-details"
										pattern="(?:[a-z0-9]|-)+"
									/>
									<Field label="Task label" name="label" />
									<TaskKindEditor defaultKind="file" />
									<Field label="Due date" name="dueAt" type="datetime-local" required={false} />
									<label className="block space-y-1.5 text-sm sm:col-span-2">
										<span className="font-medium text-neutral-200">Instructions</span>
										<textarea
											name="instructions"
											rows={3}
											className={`w-full ${INPUT_CLASSES}`}
											placeholder="What speakers should upload, write, or answer"
										/>
									</label>
									<label className="flex items-end gap-2 pb-2 text-sm text-neutral-200">
										<input name="required" type="checkbox" defaultChecked /> Required
									</label>
									<button
										disabled={pending}
										className={`sm:col-span-2 justify-self-start ${buttonClasses("secondary")}`}
									>
										Add task
									</button>
								</form>
								<Rows
									rows={configuration.tasks}
									pending={pending}
									onMove={(index, delta) =>
										move(
											"tasks",
											configuration.tasks.map((item) => item.id),
											index,
											delta,
										)
									}
									onSave={(id, data) =>
										request("/tasks", "PATCH", {
											id,
											...data,
											required: data.required === "on",
											dueAt: data.dueAt,
										})
									}
									onDelete={(id) => request("/tasks", "DELETE", { id })}
									render={(row) => (
										<>
											<Field
												label={`Task label (${row.key})`}
												name="label"
												defaultValue={row.label}
											/>
											<TaskKindEditor
												defaultKind={row.task_kind}
												defaultFields={row.form_fields}
											/>
											<Field
												label="Due date"
												name="dueAt"
												type="datetime-local"
												required={false}
												defaultValue={dueLocalValue(row.due_at)}
											/>
											<label className="block space-y-1.5 text-sm sm:col-span-2">
												<span className="font-medium text-neutral-200">Instructions</span>
												<textarea
													name="instructions"
													rows={3}
													defaultValue={row.instructions ?? ""}
													className={`w-full ${INPUT_CLASSES}`}
												/>
											</label>
											<label className="flex items-end gap-2 pb-2 text-sm text-neutral-200">
												<input
													name="required"
													type="checkbox"
													defaultChecked={row.required === 1}
												/>{" "}
												Required
											</label>
										</>
									)}
								/>
							</div>
						) : null}
					</div>
				</section>
			</div>
		</div>
	);
}

function Field({
	label,
	...props
}: InputHTMLAttributes<HTMLInputElement> & { label: string }) {
	return (
		<label className="block space-y-1.5 text-sm">
			<span className="font-medium text-neutral-200">{label}</span>
			<input required {...props} className={`w-full ${INPUT_CLASSES}`} />
		</label>
	);
}

function Rows<T extends { id: string }>({
	rows,
	pending,
	onMove,
	onSave,
	onDelete,
	render,
}: {
	rows: T[];
	pending: boolean;
	onMove: (index: number, delta: number) => void;
	onSave: (id: string, data: Record<string, string>) => Promise<boolean>;
	onDelete: (id: string) => Promise<boolean>;
	render: (row: T) => ReactNode;
}) {
	return (
		<ul className="space-y-3">
			{rows.map((row, index) => (
				<li key={row.id} className="rounded-md border border-neutral-800 p-3">
					<form
						className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]"
						onSubmit={(e) => {
							e.preventDefault();
							const values = Object.fromEntries(
								new FormData(e.currentTarget).entries(),
							) as Record<string, string>;
							void onSave(row.id, values);
						}}
					>
						{render(row)}
						<div className="flex items-end gap-2">
							<button type="submit" disabled={pending} className={buttonClasses("secondary")}>
								Save
							</button>
							<button
								type="button"
								disabled={pending || index === 0}
								onClick={() => onMove(index, -1)}
								className={buttonClasses("secondary", "sm")}
							>
								Up
							</button>
							<button
								type="button"
								disabled={pending || index === rows.length - 1}
								onClick={() => onMove(index, 1)}
								className={buttonClasses("secondary", "sm")}
							>
								Down
							</button>
							<button
								type="button"
								disabled={pending || rows.length === 1}
								onClick={() => {
									if (window.confirm("Retire this item? Historical data stays intact.")) {
										void onDelete(row.id);
									}
								}}
								className="rounded-md px-3 py-2 text-sm font-medium text-red-300 hover:bg-red-950/50 disabled:opacity-50"
							>
								Retire
							</button>
						</div>
					</form>
				</li>
			))}
		</ul>
	);
}

function TaskKindEditor({
	defaultKind,
	defaultFields = null,
}: {
	defaultKind: "text" | "file" | "form";
	defaultFields?: TaskFormField[] | null;
}) {
	const [kind, setKind] = useState(defaultKind);
	const [fields, setFields] = useState<TaskFormField[]>(
		defaultFields?.length
			? defaultFields
			: [{ key: "question-1", label: "Question 1", type: "text", required: true }],
	);
	const update = (index: number, patch: Partial<TaskFormField>) =>
		setFields((current) =>
			current.map((field, fieldIndex) =>
				fieldIndex === index ? { ...field, ...patch } : field,
			),
		);

	return (
		<div className="space-y-3 sm:col-span-2">
			<label className="block space-y-1.5 text-sm">
				<span className="font-medium text-neutral-200">Kind</span>
				<select
					name="kind"
					value={kind}
					onChange={(event) => setKind(event.target.value as typeof kind)}
					className={`w-full ${INPUT_CLASSES}`}
				>
					<option value="file">File upload</option>
					<option value="text">Written response</option>
					<option value="form">Structured form</option>
				</select>
			</label>
			{kind === "form" ? (
				<div className="rounded-md border border-neutral-800 bg-neutral-950/50 p-3">
					<div className="flex items-center justify-between gap-3">
						<div>
							<p className="text-sm font-medium text-neutral-200">Questions</p>
							<p className="text-xs text-neutral-500">
								Each answer is validated and saved together.
							</p>
						</div>
						<button
							type="button"
							onClick={() =>
								setFields((current) => [
									...current,
									{
										key: `question-${current.length + 1}`,
										label: `Question ${current.length + 1}`,
										type: "text",
										required: false,
									},
								])
							}
							className={buttonClasses("secondary", "sm")}
						>
							Add question
						</button>
					</div>
					<div className="mt-3 space-y-3">
						{fields.map((field, index) => (
							<div
								key={index}
								className="grid gap-2 rounded border border-neutral-800 p-3 sm:grid-cols-2"
							>
								<Field
									label="Question label"
									name={`label-${index}`}
									value={field.label}
									onChange={(event) => update(index, { label: event.target.value })}
								/>
								<Field
									label="Answer key"
									name={`key-${index}`}
									value={field.key}
									pattern="(?:[a-z0-9]|-)+"
									onChange={(event) => update(index, { key: event.target.value })}
								/>
								<label className="block space-y-1.5 text-sm">
									<span className="font-medium text-neutral-200">Answer type</span>
									<select
										value={field.type}
										onChange={(event) =>
											update(index, {
												type: event.target.value as TaskFormFieldType,
											})
										}
										className={`w-full ${INPUT_CLASSES}`}
									>
										<option value="text">Short text</option>
										<option value="textarea">Long text</option>
										<option value="select">Single choice</option>
										<option value="multiselect">Multiple choice</option>
										<option value="email">Email</option>
										<option value="url">URL</option>
										<option value="number">Number</option>
									</select>
								</label>
								{field.type === "select" || field.type === "multiselect" ? (
									<Field
										label="Choices (comma separated)"
										name={`options-${index}`}
										value={field.options?.join(", ") ?? ""}
										onChange={(event) =>
											update(index, {
												options: event.target.value
													.split(",")
													.map((option) => option.trim())
													.filter(Boolean),
											})
										}
									/>
								) : (
									<span />
								)}
								<label className="flex items-center gap-2 text-sm text-neutral-300">
									<input
										type="checkbox"
										checked={field.required}
										onChange={(event) =>
											update(index, { required: event.target.checked })
										}
									/>
									Required
								</label>
								<button
									type="button"
									disabled={fields.length === 1}
									onClick={() =>
										setFields((current) =>
											current.filter((_, fieldIndex) => fieldIndex !== index),
										)
									}
									className="justify-self-start text-sm text-red-300 disabled:opacity-40"
								>
									Remove
								</button>
							</div>
						))}
					</div>
				</div>
			) : null}
			<input type="hidden" name="formSchema" value={JSON.stringify(fields)} />
		</div>
	);
}
