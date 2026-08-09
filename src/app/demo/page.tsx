import Link from "next/link";
import { notFound } from "next/navigation";
import { Chip, StatusPill, submissionStatusTone } from "@/components/ui";
import {
	DEMO_EVENT_SLUG,
	DEMO_PERSPECTIVES,
	demoDay,
	demoTime,
	demoTitle,
	loadDemoData,
	type DemoPerspective,
	visibilityDescription,
} from "@/lib/demo/data";

type Props = { searchParams: Promise<{ perspective?: string }> };

const DEFAULT_PERSPECTIVE: DemoPerspective = "applicant";

function isPerspective(value: string | undefined): value is DemoPerspective {
	return DEMO_PERSPECTIVES.some((perspective) => perspective.id === value);
}

function Panel({ children, className = "" }: { children: React.ReactNode; className?: string }) {
	return <section className={`rounded-xl border border-neutral-800 bg-neutral-900/70 p-4 sm:p-5 ${className}`}>{children}</section>;
}

function EmptyDemo() {
	return (
		<main className="mx-auto max-w-3xl px-4 py-16">
			<h1 className="text-3xl font-semibold tracking-tight">Demo data is not loaded</h1>
			<p className="mt-3 max-w-xl text-neutral-400">Run the local demo seed before opening this route. The product never creates a sample event during a visitor request.</p>
		</main>
	);
}

export default async function DemoPage({ searchParams }: Props) {
	const params = await searchParams;
	const perspective = isPerspective(params.perspective) ? params.perspective : DEFAULT_PERSPECTIVE;
	const data = await loadDemoData();
	if (!data) return <EmptyDemo />;
	if (data.event.slug !== DEMO_EVENT_SLUG) notFound();

	return (
		<main className="min-h-dvh bg-neutral-950 px-4 py-6 text-neutral-100 sm:px-6 sm:py-10">
			<div className="mx-auto max-w-6xl">
				<header className="border-b border-neutral-800 pb-6">
					<div className="flex flex-wrap items-center justify-between gap-3">
						<Link href="/" className="text-sm text-neutral-400 hover:text-neutral-100">← conference-engine</Link>
						<span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-xs font-medium text-amber-300">Read-only demo data</span>
					</div>
					<h1 className="mt-5 text-balance text-3xl font-semibold tracking-tight sm:text-4xl">{data.event.name}</h1>
					<p className="mt-2 max-w-2xl text-pretty text-sm leading-6 text-neutral-400">Switch perspective to follow the same seeded program from proposal intake through review, speaker onboarding, and a published agenda. None of these views creates data, sends email, or uses an organizer session.</p>
					<nav aria-label="Demo perspective" className="mt-5 flex gap-2 overflow-x-auto pb-1">
						{DEMO_PERSPECTIVES.map((item) => {
							const active = item.id === perspective;
							return <Link key={item.id} href={`/demo?perspective=${item.id}`} aria-current={active ? "page" : undefined} className={active ? "shrink-0 rounded-md bg-emerald-500 px-3 py-2 text-sm font-medium text-neutral-950" : "shrink-0 rounded-md border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm text-neutral-300 hover:bg-neutral-800"}>{item.label}</Link>;
						})}
					</nav>
				</header>
				<div className="py-7">{renderPerspective(perspective, data)}</div>
			</div>
		</main>
	);
}

function renderPerspective(perspective: DemoPerspective, data: NonNullable<Awaited<ReturnType<typeof loadDemoData>>>) {
	switch (perspective) {
		case "applicant": return <ApplicantView data={data} />;
		case "organizer": return <OrganizerView data={data} />;
		case "reviewer": return <ReviewerView data={data} />;
		case "speaker": return <SpeakerView data={data} />;
		case "attendee": return <AttendeeView data={data} />;
	}
}

function ApplicantView({ data }: { data: NonNullable<Awaited<ReturnType<typeof loadDemoData>>> }) {
	return <div className="grid gap-5 lg:grid-cols-[1.35fr_0.65fr]">
		<Panel>
			<p className="text-sm font-medium text-emerald-400">Applicant perspective</p>
			<h2 className="mt-1 text-2xl font-semibold">{data.form.title}</h2>
			<p className="mt-2 text-sm leading-6 text-neutral-400">{data.form.description}</p>
			<div className="mt-5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">This CFP is closed in the demo. The structure below is real fixture data, but submissions and draft links are disabled.</div>
			<ul className="mt-5 divide-y divide-neutral-800 border-y border-neutral-800">
				{data.fields.map((field) => <li key={field.key} className="py-3"><div className="flex flex-wrap items-baseline justify-between gap-2"><p className="font-medium">{field.label}{field.required === 1 ? <span className="text-emerald-400"> *</span> : null}</p><span className="text-xs text-neutral-500">{field.field_type.replaceAll("_", " ")}</span></div><p className="mt-1 text-sm text-neutral-400">{visibilityDescription(field.visibility_rule)}</p></li>)}
			</ul>
		</Panel>
		<Panel className="h-fit"><p className="text-sm font-medium text-neutral-300">What happens next</p><ol className="mt-4 space-y-4 text-sm text-neutral-400"><li><span className="font-medium text-neutral-200">1. Submit</span> — proposals enter the program queue.</li><li><span className="font-medium text-neutral-200">2. Review</span> — assigned reviewers score against a shared rubric.</li><li><span className="font-medium text-neutral-200">3. Decide</span> — accepted speakers get their onboarding tasks.</li><li><span className="font-medium text-neutral-200">4. Publish</span> — scheduled sessions become visible to attendees.</li></ol></Panel>
	</div>;
}

function OrganizerView({ data }: { data: NonNullable<Awaited<ReturnType<typeof loadDemoData>>> }) {
	const pending = data.tasks.filter((task) => task.status === "pending");
	return <div className="space-y-5"><div><p className="text-sm font-medium text-emerald-400">Organizer perspective</p><h2 className="mt-1 text-2xl font-semibold">Lifecycle at a glance</h2><p className="mt-2 text-sm text-neutral-400">These counts come from the demo event’s D1 records and remain read-only.</p></div><div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{data.statusCounts.map((row) => <Panel key={row.status} className="p-3"><p className="text-2xl font-semibold">{row.count}</p><p className="mt-1 text-xs text-neutral-400">{row.status.replaceAll("_", " ")}</p></Panel>)}</div><div className="grid gap-5 lg:grid-cols-2"><Panel><h3 className="font-semibold">Outstanding speaker work</h3><ul className="mt-4 divide-y divide-neutral-800">{pending.map((task) => <li key={task.id} className="py-3 text-sm"><p className="font-medium">{task.speaker}</p><p className="mt-1 text-neutral-400">{task.template_label} · {demoTitle(task)}</p></li>)}</ul></Panel><Panel><h3 className="font-semibold">Schedule readiness</h3><p className="mt-2 text-sm text-neutral-400">{data.slots.length} placed sessions across {data.rooms.length} rooms and {data.tracks.length} tracks.</p><div className="mt-4 flex flex-wrap gap-2">{data.rooms.map((room) => <Chip key={room}>{room}</Chip>)}{data.tracks.map((track) => <Chip key={track}>{track}</Chip>)}</div><h4 className="mt-6 text-sm font-medium text-neutral-300">Recent proposals</h4><ul className="mt-2 divide-y divide-neutral-800">{data.submissions.slice(0, 5).map((submission) => <li className="flex items-center justify-between gap-3 py-2 text-sm" key={submission.id}><span className="min-w-0 truncate">{demoTitle(submission)}</span><StatusPill tone={submissionStatusTone(submission.status)}>{submission.status}</StatusPill></li>)}</ul></Panel></div></div>;
}

function ReviewerView({ data }: { data: NonNullable<Awaited<ReturnType<typeof loadDemoData>>> }) {
	const reviewer = data.reviewers[0];
	const assigned = reviewer ? data.assignments.filter((assignment) => assignment.reviewer_id === reviewer.id).map((assignment) => data.submissions.find((submission) => submission.id === assignment.submission_id)).filter((submission): submission is (typeof data.submissions)[number] => Boolean(submission)) : [];
	return <div className="space-y-5"><div><p className="text-sm font-medium text-emerald-400">Reviewer perspective</p><h2 className="mt-1 text-2xl font-semibold">{reviewer ? `Assigned to ${reviewer.name}` : "Assigned proposals"}</h2><p className="mt-2 text-sm text-neutral-400">A rendered review board, without a reviewer token or any ability to change scores.</p></div><div className="grid gap-5 lg:grid-cols-[0.8fr_1.2fr]"><Panel><h3 className="font-semibold">Rubric</h3><ul className="mt-4 space-y-4">{data.criteria.map((criterion) => <li key={criterion.label}><p className="text-sm font-medium">{criterion.label} <span className="text-neutral-500">×{criterion.weight}</span></p><p className="mt-1 text-sm text-neutral-400">{criterion.description}</p></li>)}</ul></Panel><Panel><h3 className="font-semibold">Assigned proposals</h3><ul className="mt-3 divide-y divide-neutral-800">{assigned.map((submission) => { const scores = data.scores.filter((score) => score.submission_id === submission.id); return <li key={submission.id} className="py-4"><div className="flex flex-wrap items-start justify-between gap-2"><div><p className="font-medium">{demoTitle(submission)}</p><p className="mt-1 text-sm text-neutral-400">{submission.submitter_name} · {submission.category ?? "Uncategorized"}</p></div><StatusPill tone={submissionStatusTone(submission.status)}>{submission.status}</StatusPill></div><div className="mt-3 space-y-2">{scores.length ? scores.map((score) => <p className="text-sm text-neutral-400" key={`${score.reviewer}-${score.score}`}><span className="font-medium text-neutral-200">{score.reviewer}: {score.score}/5</span>{score.comment ? ` — ${score.comment}` : ""}</p>) : <p className="text-sm text-neutral-500">Awaiting a score.</p>}</div></li>; })}</ul></Panel></div></div>;
}

function SpeakerView({ data }: { data: NonNullable<Awaited<ReturnType<typeof loadDemoData>>> }) {
	const sessions = data.submissions.filter((submission) => ["accepted", "scheduled", "published"].includes(submission.status));
	return <div className="space-y-5"><div><p className="text-sm font-medium text-emerald-400">Speaker perspective</p><h2 className="mt-1 text-2xl font-semibold">Sessions and onboarding tasks</h2><p className="mt-2 text-sm text-neutral-400">A read-only snapshot of work speakers complete after an accepted proposal.</p></div><div className="grid gap-5 lg:grid-cols-2"><Panel><h3 className="font-semibold">Accepted to stage</h3><ul className="mt-3 divide-y divide-neutral-800">{sessions.map((session) => <li key={session.id} className="flex items-center justify-between gap-3 py-3 text-sm"><div><p className="font-medium">{demoTitle(session)}</p><p className="mt-1 text-neutral-400">{session.submitter_name}</p></div><StatusPill tone={submissionStatusTone(session.status)}>{session.status}</StatusPill></li>)}</ul></Panel><Panel><h3 className="font-semibold">Task snapshot</h3><ul className="mt-3 divide-y divide-neutral-800">{data.tasks.map((task) => <li key={task.id} className="flex items-center justify-between gap-3 py-3 text-sm"><div><p className="font-medium">{task.template_label}</p><p className="mt-1 text-neutral-400">{task.speaker} · {demoTitle(task)}</p></div><StatusPill tone={task.status === "completed" ? "positive" : "warning"}>{task.status}</StatusPill></li>)}</ul></Panel></div></div>;
}

function AttendeeView({ data }: { data: NonNullable<Awaited<ReturnType<typeof loadDemoData>>> }) {
	return <div className="space-y-5"><div><p className="text-sm font-medium text-emerald-400">Attendee perspective</p><h2 className="mt-1 text-2xl font-semibold">Published program</h2><p className="mt-2 text-sm text-neutral-400">Only published slots appear in the public schedule; the full demo still shows scheduled-but-not-published placement to organizers.</p></div><div className="flex flex-wrap gap-3"><Link className="rounded-md bg-emerald-500 px-3.5 py-2 text-sm font-medium text-neutral-950 hover:bg-emerald-400" href={`/e/${DEMO_EVENT_SLUG}/schedule`}>Open public schedule</Link><Link className="rounded-md border border-neutral-700 px-3.5 py-2 text-sm font-medium text-neutral-200 hover:bg-neutral-900" href={`/embed/${DEMO_EVENT_SLUG}/schedule`}>Open embeddable schedule</Link></div><Panel><h3 className="font-semibold">Agenda preview</h3><ul className="mt-3 divide-y divide-neutral-800">{data.slots.filter((slot) => data.submissions.find((submission) => demoTitle(submission) === demoTitle(slot))?.status === "published").map((slot) => <li key={`${slot.starts_at}-${slot.room_name}`} className="grid gap-1 py-3 text-sm sm:grid-cols-[150px_1fr_auto]"><span className="text-neutral-400">{demoDay(slot.starts_at, data.event.timezone)} · {demoTime(slot.starts_at, data.event.timezone)}</span><span><span className="font-medium">{demoTitle(slot)}</span><span className="text-neutral-400"> · {slot.speaker}</span></span><span className="text-neutral-500">{slot.room_name} · {slot.track}</span></li>)}</ul></Panel></div>;
}
