"use client";

import { useMemo, useState } from "react";
import { CfpFieldInput } from "@/components/cfp-field-input";
import {
	evaluateVisibilityRule,
	groupFieldsBySection,
	type AnswerMap,
	type FormFieldDef,
	type FormSection,
	type SpeakerAnswer,
} from "@/lib/domain";

type PreviewField = FormFieldDef & { id?: string };

type Props = {
	title: string;
	description: string;
	sections: FormSection[];
	fields: PreviewField[];
};

export function FormBuilderPreview({ title, description, sections, fields }: Props) {
	const [answers, setAnswers] = useState<AnswerMap>(() => initialAnswers(fields));
	const visibleFields = useMemo(
		() => fields.filter((field) => evaluateVisibilityRule(field.visibilityRule, answers)),
		[fields, answers],
	);
	const groupedFields = useMemo(
		() => groupFieldsBySection(visibleFields, sections),
		[visibleFields, sections],
	);

	return (
		<div className="rounded-lg border border-neutral-800 bg-neutral-950/70 p-4">
			<div className="mb-4 border-b border-neutral-800 pb-3">
				<p className="text-xs font-medium uppercase tracking-wide text-emerald-400/80">Live preview</p>
				<h3 className="mt-1 text-lg font-semibold text-neutral-100">{title || "Untitled form"}</h3>
				{description.trim() ? (
					<p className="mt-1 text-sm text-neutral-400">{description}</p>
				) : (
					<p className="mt-1 text-sm text-neutral-500">Public form preview updates as you edit fields.</p>
				)}
			</div>
			<div className="space-y-5">
				<div className="grid gap-3 sm:grid-cols-2">
					<label className="flex flex-col gap-1 text-sm">
						<span className="font-medium text-neutral-300">Your name</span>
						<input disabled className="rounded-md border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm text-neutral-500" placeholder="Preview only" />
					</label>
					<label className="flex flex-col gap-1 text-sm">
						<span className="font-medium text-neutral-300">Your email</span>
						<input disabled type="email" className="rounded-md border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm text-neutral-500" placeholder="Preview only" />
					</label>
				</div>
				{groupedFields.length === 0 ? (
					<p className="text-sm text-neutral-500">Add fields to see them here.</p>
				) : groupedFields.map((group, index) => (
					<section key={group.section?.key ?? `preview-${index}`} className="space-y-4">
						{group.section ? (
							<div className="border-b border-neutral-800 pb-2">
								<h4 className="text-sm font-medium text-neutral-200">{group.section.title}</h4>
								{group.section.description ? (
									<p className="mt-1 text-xs text-neutral-500">{group.section.description}</p>
								) : null}
							</div>
						) : null}
						{group.fields.map((field) => (
							<CfpFieldInput
								key={field.key}
								field={field}
								value={answers[field.key]}
								preview
								onChange={(value) => setAnswers((prev) => ({ ...prev, [field.key]: value }))}
							/>
						))}
					</section>
				))}
			</div>
		</div>
	);
}

function initialAnswers(fields: PreviewField[]): AnswerMap {
	const answers: AnswerMap = {};
	for (const field of fields) {
		if (field.config.kind === "speaker_block") {
			answers[field.key] = [{ name: "", email: "", bio: "" }] satisfies SpeakerAnswer[];
		} else if (field.fieldType === "multiselect") {
			answers[field.key] = [];
		} else if (field.config.kind === "file_upload") {
			answers[field.key] = null;
		} else {
			answers[field.key] = "";
		}
	}
	return answers;
}
