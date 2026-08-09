"use client";

import { useState, type ChangeEvent } from "react";
import { INPUT_CLASSES } from "@/components/ui";
import { uploadAcceptAttr } from "@/lib/cfp/file-upload";
import { isFileUploadAnswer, type FileUploadAnswer, type FormFieldDef, type SpeakerAnswer } from "@/lib/domain";

export type CfpFieldInputProps = {
	field: FormFieldDef;
	value: unknown;
	onChange: (value: unknown) => void;
	fieldsetRef?: (element: HTMLFieldSetElement | null) => void;
	errorMessage?: string;
	preview?: boolean;
	uploadBaseUrl?: string;
	uploadBusyKey?: string | null;
	onUploadStart?: (fieldKey: string) => void;
	onUploadEnd?: (fieldKey: string) => void;
};

export function CfpFieldInput({
	field,
	value,
	onChange,
	fieldsetRef,
	errorMessage,
	preview = false,
	uploadBaseUrl,
	uploadBusyKey,
	onUploadStart,
	onUploadEnd,
}: CfpFieldInputProps) {
	const label = (
		<span className="font-medium">
			{field.label}
			{field.required ? " *" : ""}
		</span>
	);

	switch (field.config.kind) {
		case "text":
		case "url":
		case "video":
		case "email": {
			const textValue = typeof value === "string" ? value : "";
			const maxLength = field.config.kind === "text" ? field.config.maxLength : undefined;
			return (
				<label className="flex flex-col gap-1 text-sm">
					{label}
					{field.helpText ? (
						<span className="text-xs text-neutral-500">{field.helpText}</span>
					) : null}
					<input
						required={field.required}
						aria-required={field.required || undefined}
						disabled={preview}
						type={
							field.config.kind === "email"
								? "email"
								: field.config.kind === "url" || field.config.kind === "video"
									? "url"
									: "text"
						}
						className={INPUT_CLASSES}
						placeholder={field.config.placeholder}
						maxLength={maxLength}
						value={textValue}
						onChange={(e) => onChange(e.target.value)}
					/>
					{maxLength != null ? (
						<span className="text-xs text-neutral-500 tabular-nums">
							{textValue.length}/{maxLength}
						</span>
					) : null}
				</label>
			);
		}
		case "textarea": {
			const textValue = typeof value === "string" ? value : "";
			const maxLength = field.config.maxLength;
			return (
				<label className="flex flex-col gap-1 text-sm">
					{label}
					{field.helpText ? (
						<span className="text-xs text-neutral-500">{field.helpText}</span>
					) : null}
					<textarea
						required={field.required}
						aria-required={field.required || undefined}
						disabled={preview}
						className={INPUT_CLASSES}
						rows={field.config.rows ?? 4}
						placeholder={field.config.placeholder}
						maxLength={maxLength}
						value={textValue}
						onChange={(e) => onChange(e.target.value)}
					/>
					{maxLength != null ? (
						<span className="text-xs text-neutral-500 tabular-nums">
							{textValue.length}/{maxLength}
						</span>
					) : null}
				</label>
			);
		}
		case "number":
			return (
				<label className="flex flex-col gap-1 text-sm">
					{label}
					{field.helpText ? (
						<span className="text-xs text-neutral-500">{field.helpText}</span>
					) : null}
					<input
						required={field.required}
						aria-required={field.required || undefined}
						disabled={preview}
						type="number"
						className={INPUT_CLASSES}
						min={field.config.min}
						max={field.config.max}
						step={field.config.step}
						value={typeof value === "number" ? value : value === "" ? "" : Number(value)}
						onChange={(e) => {
							const raw = e.target.value;
							onChange(raw === "" ? "" : Number(raw));
						}}
					/>
				</label>
			);
		case "select":
			return (
				<label className="flex flex-col gap-1 text-sm">
					{label}
					{field.helpText ? (
						<span className="text-xs text-neutral-500">{field.helpText}</span>
					) : null}
					<select
						required={field.required}
						aria-required={field.required || undefined}
						disabled={preview}
						className={INPUT_CLASSES}
						value={typeof value === "string" ? value : ""}
						onChange={(e) => onChange(e.target.value)}
					>
						<option value="">Select…</option>
						{field.config.options.map((opt) => (
							<option key={opt.value} value={opt.value}>
								{opt.label}
							</option>
						))}
					</select>
				</label>
			);
		case "multiselect":
			return (
				<fieldset
					ref={fieldsetRef}
					tabIndex={-1}
					className="flex flex-col gap-2 text-sm"
					aria-required={field.required || undefined}
					aria-invalid={errorMessage ? true : undefined}
					aria-describedby={errorMessage ? `cfp-field-error-${field.key}` : undefined}
				>
					<legend className="font-medium">{field.label}</legend>
					{field.helpText ? (
						<span className="text-xs text-neutral-500">{field.helpText}</span>
					) : null}
					{errorMessage ? (
						<p id={`cfp-field-error-${field.key}`} role="alert" aria-live="assertive" className="text-sm text-red-300">
							{errorMessage}
						</p>
					) : null}
					{field.config.options.map((opt) => {
						const selected = Array.isArray(value) ? (value as string[]) : [];
						const checked = selected.includes(opt.value);
						return (
							<label key={opt.value} className="flex items-center gap-2">
								<input
									type="checkbox"
									disabled={preview}
									checked={checked}
									onChange={(e) => {
										if (e.target.checked) onChange([...selected, opt.value]);
										else onChange(selected.filter((v) => v !== opt.value));
									}}
								/>
								{opt.label}
							</label>
						);
					})}
				</fieldset>
			);
		case "speaker_block": {
			const speakers = Array.isArray(value) ? (value as SpeakerAnswer[]) : [];
			const min = Math.max(1, field.config.minSpeakers ?? 1);
			const max = field.config.maxSpeakers ?? 4;
			return (
				<fieldset className="flex flex-col gap-3 text-sm" aria-required="true">
					<legend className="font-medium">{field.label} *</legend>
					<p className="text-xs text-neutral-500">
						Add {min}–{max} speakers. The first speaker is the primary contact.
					</p>
					{speakers.map((speaker, index) => (
						<div
							key={index}
							className="grid gap-2 rounded-md border border-neutral-800 bg-neutral-900 p-3 sm:grid-cols-2"
						>
							<p className="col-span-full text-xs font-medium uppercase tracking-wide text-neutral-500">
								{index === 0 ? "Primary speaker" : `Co-speaker ${index}`}
							</p>
							<label className="flex flex-col gap-1">
								<span>Name</span>
								<input
									required
									aria-required="true"
									disabled={preview}
									className={INPUT_CLASSES}
									value={speaker.name}
									onChange={(e) => {
										const next = [...speakers];
										next[index] = { ...speaker, name: e.target.value };
										onChange(next);
									}}
								/>
							</label>
							<label className="flex flex-col gap-1">
								<span>Email</span>
								<input
									type="email"
									required
									aria-required="true"
									disabled={preview}
									className={INPUT_CLASSES}
									value={speaker.email}
									onChange={(e) => {
										const next = [...speakers];
										next[index] = { ...speaker, email: e.target.value };
										onChange(next);
									}}
								/>
							</label>
							<label className="col-span-full flex flex-col gap-1">
								<span>Bio</span>
								<textarea
									disabled={preview}
									className={INPUT_CLASSES}
									rows={2}
									value={speaker.bio ?? ""}
									onChange={(e) => {
										const next = [...speakers];
										next[index] = { ...speaker, bio: e.target.value };
										onChange(next);
									}}
								/>
							</label>
							{!preview && index > 0 && speakers.length > min ? (
								<button type="button" className="justify-self-start text-xs text-neutral-400 underline underline-offset-2 hover:text-neutral-100" onClick={() => onChange(speakers.filter((_, speakerIndex) => speakerIndex !== index))}>Remove co-speaker</button>
							) : null}
						</div>
					))}
					{!preview && speakers.length < max ? (
						<button
							type="button"
							className="self-start text-sm text-neutral-300 underline underline-offset-2 hover:text-neutral-100"
							onClick={() => onChange([...speakers, { name: "", email: "", bio: "" }])}
						>
							Add co-speaker
						</button>
					) : null}
				</fieldset>
			);
		}
		case "file_upload":
			return (
				<CfpFileUploadField
					field={field}
					config={field.config}
					value={value}
					preview={preview}
					uploadBaseUrl={uploadBaseUrl}
					busy={uploadBusyKey === field.key}
					errorMessage={errorMessage}
					onChange={onChange}
					onUploadStart={onUploadStart}
					onUploadEnd={onUploadEnd}
				/>
			);
		default: {
			const _exhaustive: never = field.config;
			return _exhaustive;
		}
	}
}

type CfpFileUploadFieldProps = {
	field: FormFieldDef;
	config: Extract<FormFieldDef["config"], { kind: "file_upload" }>;
	value: unknown;
	preview: boolean;
	uploadBaseUrl?: string;
	busy: boolean;
	errorMessage?: string;
	onChange: (value: unknown) => void;
	onUploadStart?: (fieldKey: string) => void;
	onUploadEnd?: (fieldKey: string) => void;
};

function CfpFileUploadField({
	field,
	config,
	value,
	preview,
	uploadBaseUrl,
	busy,
	errorMessage,
	onChange,
	onUploadStart,
	onUploadEnd,
}: CfpFileUploadFieldProps) {
	const [uploadError, setUploadError] = useState<string | null>(null);
	const upload = isFileUploadAnswer(value) ? value : null;
	const displayedError = errorMessage ?? uploadError;

	async function deleteUpload(assetId: string) {
		if (!uploadBaseUrl) return;
		await fetch(
			`${uploadBaseUrl}?fieldKey=${encodeURIComponent(field.key)}&assetId=${encodeURIComponent(assetId)}`,
			{ method: "DELETE" },
		);
	}

	async function handleFileSelected(event: ChangeEvent<HTMLInputElement>, previousAssetId: string | null) {
		const file = event.target.files?.[0];
		event.target.value = "";
		if (!file || !uploadBaseUrl) return;
		setUploadError(null);
		onUploadStart?.(field.key);
		try {
			const response = await fetch(`${uploadBaseUrl}?fieldKey=${encodeURIComponent(field.key)}`, {
				method: "POST",
				body: (() => {
					const body = new FormData();
					body.set("file", file);
					return body;
				})(),
			});
			const json = await response.json() as { ok?: boolean; upload?: FileUploadAnswer; error?: string };
			if (!response.ok || !json.ok || !json.upload) {
				throw new Error(json.error ?? "Upload failed");
			}
			if (previousAssetId && previousAssetId !== json.upload.assetId) {
				void deleteUpload(previousAssetId);
			}
			onChange(json.upload);
		} catch (error: unknown) {
			const message = error instanceof Error ? error.message : "Upload failed";
			setUploadError(message);
		} finally {
			onUploadEnd?.(field.key);
		}
	}

	const label = (
		<span className="font-medium">
			{field.label}
			{field.required ? " *" : ""}
		</span>
	);

	return (
		<div className="flex flex-col gap-1 text-sm">
			{label}
			{field.helpText ? (
				<span className="text-xs text-neutral-500">{field.helpText}</span>
			) : null}
			{displayedError ? (
				<p id={`cfp-field-error-${field.key}`} role="alert" aria-live="assertive" className="text-sm text-red-300">
					{displayedError}
				</p>
			) : null}
			{upload ? (
				<div className="space-y-2">
					<p className="rounded-md border border-neutral-800 bg-neutral-950/60 px-3 py-2 text-xs text-neutral-300">
						{upload.filename}
						{!preview ? (
							<button
								type="button"
								className="ml-3 text-neutral-400 underline underline-offset-2 hover:text-neutral-100"
								onClick={() => {
									void deleteUpload(upload.assetId);
									setUploadError(null);
									onChange(null);
								}}
							>
								Remove
							</button>
						) : null}
					</p>
					{!preview ? (
						<label className="inline-flex text-xs text-neutral-400">
							Replace file
							<input
								type="file"
								className="sr-only"
								accept={uploadAcceptAttr(config)}
								disabled={busy || !uploadBaseUrl}
								onChange={(event) => {
									void handleFileSelected(event, upload.assetId);
								}}
							/>
						</label>
					) : null}
				</div>
			) : preview ? (
				<p className="rounded-md border border-dashed border-neutral-700 px-3 py-4 text-xs text-neutral-500">
					File upload (preview only)
				</p>
			) : (
				<label className="flex flex-col gap-1">
					<input
						type="file"
						required={field.required}
						aria-required={field.required || undefined}
						aria-invalid={displayedError ? true : undefined}
						aria-describedby={displayedError ? `cfp-field-error-${field.key}` : undefined}
						accept={uploadAcceptAttr(config)}
						disabled={busy || !uploadBaseUrl}
						className="text-xs text-neutral-300 file:mr-3 file:rounded-md file:border-0 file:bg-neutral-800 file:px-3 file:py-2 file:text-neutral-100"
						onChange={(event) => {
							void handleFileSelected(event, null);
						}}
					/>
					<span className="text-xs text-neutral-500">
						{busy ? "Uploading…" : `Max ${Math.floor((config.maxBytes ?? 10 * 1024 * 1024) / (1024 * 1024))}MB`}
					</span>
				</label>
			)}
		</div>
	);
}
