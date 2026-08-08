"use client";

import { useMemo, useState, useTransition } from "react";
import {
	evaluateVisibilityRule,
	type AnswerMap,
	type FormFieldDef,
	type SpeakerAnswer,
} from "@/lib/domain";
import { submitCfpAction } from "./actions";

type Props = {
	eventSlug: string;
	formSlug: string;
	eventName: string;
	formTitle: string;
	formDescription: string | null;
	fields: FormFieldDef[];
};

export function CfpForm({
	eventSlug,
	formSlug,
	eventName,
	formTitle,
	formDescription,
	fields,
}: Props) {
	const [answers, setAnswers] = useState<AnswerMap>(() => initialAnswers(fields));
	const [submitterName, setSubmitterName] = useState("");
	const [submitterEmail, setSubmitterEmail] = useState("");
	const [errors, setErrors] = useState<string[]>([]);
	const [submissionId, setSubmissionId] = useState<string | null>(null);
	const [pending, startTransition] = useTransition();

	const visibleFields = useMemo(
		() => fields.filter((f) => evaluateVisibilityRule(f.visibilityRule, answers)),
		[fields, answers],
	);

	if (submissionId) {
		return (
			<div className="space-y-3">
				<h1 className="text-2xl font-semibold tracking-tight">Submitted</h1>
				<p className="text-sm text-neutral-600">
					Thanks. Submission id: <code className="text-xs">{submissionId}</code>
				</p>
			</div>
		);
	}

	return (
		<form
			className="mx-auto flex w-full max-w-2xl flex-col gap-6"
			onSubmit={(e) => {
				e.preventDefault();
				setErrors([]);
				startTransition(async () => {
					const result = await submitCfpAction({
						eventSlug,
						formSlug,
						submitterName,
						submitterEmail,
						answers,
					});
					if (!result.ok) {
						setErrors(result.errors);
						return;
					}
					setSubmissionId(result.submissionId);
				});
			}}
		>
			<header className="space-y-2 border-b border-neutral-200 pb-4">
				<p className="text-xs uppercase tracking-wide text-neutral-500">{eventName}</p>
				<h1 className="text-3xl font-semibold tracking-tight">{formTitle}</h1>
				{formDescription ? (
					<p className="text-sm text-neutral-600">{formDescription}</p>
				) : null}
			</header>

			<section className="grid gap-4 sm:grid-cols-2">
				<label className="flex flex-col gap-1 text-sm">
					<span className="font-medium">Your name</span>
					<input
						required
						className="rounded border border-neutral-300 px-3 py-2"
						value={submitterName}
						onChange={(e) => setSubmitterName(e.target.value)}
					/>
				</label>
				<label className="flex flex-col gap-1 text-sm">
					<span className="font-medium">Your email</span>
					<input
						required
						type="email"
						className="rounded border border-neutral-300 px-3 py-2"
						value={submitterEmail}
						onChange={(e) => setSubmitterEmail(e.target.value)}
					/>
				</label>
			</section>

			{visibleFields.map((field) => (
				<FieldInput
					key={field.key}
					field={field}
					value={answers[field.key]}
					onChange={(value) =>
						setAnswers((prev) => ({
							...prev,
							[field.key]: value,
						}))
					}
				/>
			))}

			{errors.length > 0 ? (
				<ul className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
					{errors.map((err) => (
						<li key={err}>{err}</li>
					))}
				</ul>
			) : null}

			<button
				type="submit"
				disabled={pending}
				className="rounded bg-neutral-900 px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50"
			>
				{pending ? "Submitting…" : "Submit proposal"}
			</button>
		</form>
	);
}

function initialAnswers(fields: FormFieldDef[]): AnswerMap {
	const answers: AnswerMap = {};
	for (const field of fields) {
		if (field.fieldType === "speaker_block") {
			answers[field.key] = [{ name: "", email: "", bio: "" }] satisfies SpeakerAnswer[];
		} else if (field.fieldType === "multiselect") {
			answers[field.key] = [];
		} else {
			answers[field.key] = "";
		}
	}
	return answers;
}

function FieldInput({
	field,
	value,
	onChange,
}: {
	field: FormFieldDef;
	value: unknown;
	onChange: (value: unknown) => void;
}) {
	const label = (
		<span className="font-medium">
			{field.label}
			{field.required ? " *" : ""}
		</span>
	);

	switch (field.config.kind) {
		case "text":
		case "url":
		case "email":
			return (
				<label className="flex flex-col gap-1 text-sm">
					{label}
					{field.helpText ? (
						<span className="text-xs text-neutral-500">{field.helpText}</span>
					) : null}
					<input
						type={
							field.config.kind === "email"
								? "email"
								: field.config.kind === "url"
									? "url"
									: "text"
						}
						className="rounded border border-neutral-300 px-3 py-2"
						placeholder={field.config.placeholder}
						value={typeof value === "string" ? value : ""}
						onChange={(e) => onChange(e.target.value)}
					/>
				</label>
			);
		case "textarea":
			return (
				<label className="flex flex-col gap-1 text-sm">
					{label}
					<textarea
						className="rounded border border-neutral-300 px-3 py-2"
						rows={field.config.rows ?? 4}
						placeholder={field.config.placeholder}
						value={typeof value === "string" ? value : ""}
						onChange={(e) => onChange(e.target.value)}
					/>
				</label>
			);
		case "number":
			return (
				<label className="flex flex-col gap-1 text-sm">
					{label}
					{field.helpText ? (
						<span className="text-xs text-neutral-500">{field.helpText}</span>
					) : null}
					<input
						type="number"
						className="rounded border border-neutral-300 px-3 py-2"
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
						className="rounded border border-neutral-300 px-3 py-2"
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
				<fieldset className="flex flex-col gap-2 text-sm">
					<legend className="font-medium">{field.label}</legend>
					{field.config.options.map((opt) => {
						const selected = Array.isArray(value) ? (value as string[]) : [];
						const checked = selected.includes(opt.value);
						return (
							<label key={opt.value} className="flex items-center gap-2">
								<input
									type="checkbox"
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
			const max = field.config.maxSpeakers ?? 4;
			return (
				<fieldset className="flex flex-col gap-3 text-sm">
					<legend className="font-medium">{field.label} *</legend>
					{speakers.map((speaker, index) => (
						<div
							key={index}
							className="grid gap-2 rounded border border-neutral-200 p-3 sm:grid-cols-2"
						>
							<label className="flex flex-col gap-1">
								<span>Name</span>
								<input
									className="rounded border border-neutral-300 px-3 py-2"
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
									className="rounded border border-neutral-300 px-3 py-2"
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
									className="rounded border border-neutral-300 px-3 py-2"
									rows={2}
									value={speaker.bio ?? ""}
									onChange={(e) => {
										const next = [...speakers];
										next[index] = { ...speaker, bio: e.target.value };
										onChange(next);
									}}
								/>
							</label>
						</div>
					))}
					{speakers.length < max ? (
						<button
							type="button"
							className="self-start text-sm text-neutral-700 underline"
							onClick={() =>
								onChange([...speakers, { name: "", email: "", bio: "" }])
							}
						>
							Add speaker
						</button>
					) : null}
				</fieldset>
			);
		}
		default: {
			const _exhaustive: never = field.config;
			return _exhaustive;
		}
	}
}
