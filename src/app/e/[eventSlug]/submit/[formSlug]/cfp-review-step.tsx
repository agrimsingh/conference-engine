import type { AnswerMap, FormFieldDef } from "@/lib/domain";
import { buttonClasses } from "@/components/ui";

type Props = {
	submitterName: string;
	submitterEmail: string;
	fields: FormFieldDef[];
	answers: AnswerMap;
	onBack: () => void;
	onConfirm: () => void;
	busy: boolean;
};

export function CfpReviewStep({
	submitterName,
	submitterEmail,
	fields,
	answers,
	onBack,
	onConfirm,
	busy,
}: Props) {
	return (
		<div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
			<header className="space-y-2 border-b border-neutral-800 pb-5">
				<p className="text-xs font-medium uppercase tracking-wide text-neutral-500">
					Review before submitting
				</p>
				<h1 className="text-balance text-3xl font-semibold tracking-tight text-neutral-100">
					Check your proposal
				</h1>
				<p className="text-pretty text-sm text-neutral-400">
					Confirm your details below. You can go back to edit anything before you submit.
				</p>
			</header>

			<section className="rounded-lg border border-neutral-800 bg-neutral-900/60 p-4 text-sm">
				<h2 className="font-medium text-neutral-200">Contact</h2>
				<dl className="mt-3 grid gap-2 sm:grid-cols-2">
					<div>
						<dt className="text-xs text-neutral-500">Name</dt>
						<dd className="text-neutral-100">{submitterName.trim() || "—"}</dd>
					</div>
					<div>
						<dt className="text-xs text-neutral-500">Email</dt>
						<dd className="text-neutral-100">{submitterEmail.trim() || "—"}</dd>
					</div>
				</dl>
			</section>

			<section className="space-y-4">
				{fields.map((field) => (
					<article key={field.key} className="rounded-lg border border-neutral-800 bg-neutral-900/60 p-4 text-sm">
						<h2 className="font-medium text-neutral-200">{field.label}</h2>
						<div className="mt-2 whitespace-pre-wrap text-neutral-300">
							{formatReviewAnswer(field, answers[field.key])}
						</div>
					</article>
				))}
			</section>

			<div className="flex flex-wrap items-center gap-3 border-t border-neutral-800 pt-4">
				<button type="button" disabled={busy} className={buttonClasses("secondary")} onClick={onBack}>
					Back to edit
				</button>
				<button type="button" disabled={busy} className={buttonClasses("primary")} onClick={onConfirm}>
					{busy ? "Submitting…" : "Submit proposal"}
				</button>
			</div>
		</div>
	);
}

function formatReviewAnswer(field: FormFieldDef, value: unknown): string {
	switch (field.config.kind) {
		case "text":
		case "textarea":
		case "url":
		case "video":
		case "email":
			return typeof value === "string" && value.trim() ? value : "—";
		case "number":
			return typeof value === "number" && !Number.isNaN(value) ? String(value) : "—";
		case "select": {
			if (typeof value !== "string" || !value) return "—";
			const config = field.config;
			return config.kind === "select"
				? config.options.find((option) => option.value === value)?.label ?? value
				: "—";
		}
		case "multiselect": {
			if (!Array.isArray(value) || value.length === 0) return "—";
			const config = field.config;
			if (config.kind !== "multiselect") return "—";
			const labels = (value as string[]).map(
				(item) => config.options.find((option) => option.value === item)?.label ?? item,
			);
			return labels.join(", ");
		}
		case "speaker_block": {
			if (!Array.isArray(value) || value.length === 0) return "—";
			return (value as Array<{ name?: string; email?: string; bio?: string }>)
				.map((speaker, index) => {
					const name = speaker.name?.trim() || "Unnamed speaker";
					const email = speaker.email?.trim();
					const bio = speaker.bio?.trim();
					const header = index === 0 ? `${name}${email ? ` · ${email}` : ""}` : `${name}${email ? ` · ${email}` : ""}`;
					return bio ? `${header}\n${bio}` : header;
				})
				.join("\n\n");
		}
		default:
			return "—";
	}
}
