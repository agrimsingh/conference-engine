import type { ReactNode } from "react";
import { PageHeader } from "@/components/page-header";
import { LogoMark } from "@/components/logo";
import {
	Chip,
	INPUT_CLASSES,
	StatusPill,
	buttonClasses,
	noticeClasses,
	segmentedItemClasses,
	SEGMENTED_CONTAINER_CLASSES,
} from "@/components/ui";

const TALKS = [
	{
		id: "1",
		title: "Postgres for AI workloads",
		speaker: "Maya Chen",
		email: "maya@nines.org",
		format: "Talk",
		category: "Infra",
		status: "accepted" as const,
		score: "4.6",
		reviewers: 3,
		tasks: "1/3",
	},
	{
		id: "2",
		title: "Agents in production",
		speaker: "Jonas Weber",
		email: "jonas@field.dev",
		format: "Talk",
		category: "Agents",
		status: "accepted" as const,
		score: "4.4",
		reviewers: 3,
		tasks: "2/3",
	},
	{
		id: "3",
		title: "Evals beyond vibes",
		speaker: "Priya Nair",
		email: "priya@eval.io",
		format: "Talk",
		category: "Evals",
		status: "accepted" as const,
		score: "4.2",
		reviewers: 2,
		tasks: "3/3",
	},
	{
		id: "4",
		title: "Prompt injection red-teaming",
		speaker: "Felix Braun",
		email: "felix@redteam.xyz",
		format: "Workshop",
		category: "Security",
		status: "rejected" as const,
		score: "2.1",
		reviewers: 2,
		tasks: null,
	},
	{
		id: "5",
		title: "Voice agents in production",
		speaker: "Julia Kovacs",
		email: "julia@voice.app",
		format: "Talk",
		category: "Agents",
		status: "rejected" as const,
		score: "2.8",
		reviewers: 3,
		tasks: null,
	},
] as const;

const NAV_GROUPS = [
	{
		id: "overview",
		label: "Overview",
		items: [{ scene: "dashboard", label: "Dashboard" }],
	},
	{
		id: "program",
		label: "Program",
		items: [
			{ scene: "submissions", label: "Submissions" },
			{ scene: "review", label: "Review" },
			{ scene: "schedule", label: "Schedule" },
		],
	},
	{
		id: "speakers",
		label: "Speakers",
		items: [{ scene: "speakers", label: "Tasks" }],
	},
	{
		id: "manage",
		label: "Manage",
		items: [{ scene: "forms", label: "Forms" }],
	},
] as const;

const DEMO_CSS = `
#ce-demo [data-panel] { display: none; }
#ce-demo:has(#demo-dashboard:checked) [data-panel="dashboard"] { display: block; }
#ce-demo:has(#demo-submissions:checked) [data-panel="submissions"] { display: block; }
#ce-demo:has(#demo-review:checked) [data-panel="review"] { display: block; }
#ce-demo:has(#demo-speakers:checked) [data-panel="speakers"] { display: block; }
#ce-demo:has(#demo-schedule:checked) [data-panel="schedule"] { display: block; }
#ce-demo:has(#demo-forms:checked) [data-panel="forms"] { display: block; }
#ce-demo:has(#demo-public:checked) [data-panel="public"] { display: block; }
#ce-demo:has(#demo-q-accepted:checked) [data-status="rejected"] { display: none; }
#ce-demo:has(#demo-q-declined:checked) [data-status="accepted"] { display: none; }
#ce-demo:has(#demo-notified:checked) [data-unnotified] { display: none; }
#ce-demo [data-notified] { display: none; }
#ce-demo:has(#demo-notified:checked) p[data-notified] { display: block; }
#ce-demo:has(#demo-notified:checked) span[data-notified] { display: contents; }
#ce-demo [data-compose] { display: none; }
#ce-demo:has(#demo-compose:checked) [data-compose] { display: flex; }
#ce-demo:has(#demo-notified:checked) [data-compose] { display: none; }
#ce-demo:has(#demo-placed:checked) [data-unplaced] { display: none; }
#ce-demo [data-placed] { display: none; }
#ce-demo:has(#demo-placed:checked) div[data-placed] { display: block; }
#ce-demo:has(#demo-placed:checked) p[data-placed] { display: block; }
#ce-demo:has(#demo-placed:checked) span[data-placed] { display: inline-flex; }
#ce-demo:has(#demo-reminded:checked) [data-remind] { display: none; }
#ce-demo [data-reminded] { display: none; }
#ce-demo:has(#demo-reminded:checked) span[data-reminded] { display: inline-flex; }
#ce-demo:has(#demo-reminded:checked) p[data-reminded] { display: block; }
#ce-demo:has(#demo-format-workshop:checked) [data-talk-fields] { display: none; }
#ce-demo [data-workshop-fields] { display: none; }
#ce-demo:has(#demo-format-workshop:checked) [data-workshop-fields] { display: block; }
#ce-demo [data-nav-suffix] { display: none; }
#ce-demo:has(#demo-dashboard:checked) [data-nav-suffix="dashboard"] { display: inline; }
#ce-demo:has(#demo-submissions:checked) [data-nav-suffix="submissions"] { display: inline; }
#ce-demo:has(#demo-review:checked) [data-nav-suffix="review"] { display: inline; }
#ce-demo:has(#demo-schedule:checked) [data-nav-suffix="schedule"] { display: inline; }
#ce-demo:has(#demo-speakers:checked) [data-nav-suffix="speakers"] { display: inline; }
#ce-demo:has(#demo-forms:checked) [data-nav-suffix="forms"] { display: inline; }
#ce-demo:has(#demo-dashboard:checked) [data-nav-group="overview"],
#ce-demo:has(#demo-submissions:checked) [data-nav-group="program"],
#ce-demo:has(#demo-review:checked) [data-nav-group="program"],
#ce-demo:has(#demo-schedule:checked) [data-nav-group="program"],
#ce-demo:has(#demo-speakers:checked) [data-nav-group="speakers"],
#ce-demo:has(#demo-forms:checked) [data-nav-group="manage"] {
	background-color: rgb(38 38 38);
	color: rgb(245 245 245);
}
#ce-demo:has(#demo-dashboard:checked) [data-nav-item="dashboard"],
#ce-demo:has(#demo-submissions:checked) [data-nav-item="submissions"],
#ce-demo:has(#demo-review:checked) [data-nav-item="review"],
#ce-demo:has(#demo-schedule:checked) [data-nav-item="schedule"],
#ce-demo:has(#demo-speakers:checked) [data-nav-item="speakers"],
#ce-demo:has(#demo-forms:checked) [data-nav-item="forms"],
#ce-demo:has(#demo-public:checked) [data-nav-public] {
	background-color: rgb(38 38 38);
	color: rgb(245 245 245);
}
#ce-demo-shell [data-explain-body] { display: none; }
#ce-demo-shell:has(#demo-dashboard:checked) [data-explain-nav="dashboard"] [data-explain-body],
#ce-demo-shell:has(#demo-submissions:checked) [data-explain-nav="submissions"] [data-explain-body],
#ce-demo-shell:has(#demo-review:checked) [data-explain-nav="review"] [data-explain-body],
#ce-demo-shell:has(#demo-speakers:checked) [data-explain-nav="speakers"] [data-explain-body],
#ce-demo-shell:has(#demo-schedule:checked) [data-explain-nav="schedule"] [data-explain-body],
#ce-demo-shell:has(#demo-forms:checked) [data-explain-nav="forms"] [data-explain-body],
#ce-demo-shell:has(#demo-public:checked) [data-explain-nav="public"] [data-explain-body] {
	display: block;
}
#ce-demo-shell [data-explain-nav] [data-explain-title] { color: rgb(115 115 115); }
#ce-demo-shell [data-explain-nav]:hover [data-explain-title] { color: rgb(212 212 212); }
#ce-demo-shell:has(#demo-dashboard:checked) [data-explain-nav="dashboard"] [data-explain-title],
#ce-demo-shell:has(#demo-submissions:checked) [data-explain-nav="submissions"] [data-explain-title],
#ce-demo-shell:has(#demo-review:checked) [data-explain-nav="review"] [data-explain-title],
#ce-demo-shell:has(#demo-speakers:checked) [data-explain-nav="speakers"] [data-explain-title],
#ce-demo-shell:has(#demo-schedule:checked) [data-explain-nav="schedule"] [data-explain-title],
#ce-demo-shell:has(#demo-forms:checked) [data-explain-nav="forms"] [data-explain-title],
#ce-demo-shell:has(#demo-public:checked) [data-explain-nav="public"] [data-explain-title] {
	color: rgb(245 245 245);
}
@media (max-width: 1279px) {
	#ce-demo-shell [data-explain-nav] { display: none; }
	#ce-demo-shell:has(#demo-dashboard:checked) [data-explain-nav="dashboard"],
	#ce-demo-shell:has(#demo-submissions:checked) [data-explain-nav="submissions"],
	#ce-demo-shell:has(#demo-review:checked) [data-explain-nav="review"],
	#ce-demo-shell:has(#demo-speakers:checked) [data-explain-nav="speakers"],
	#ce-demo-shell:has(#demo-schedule:checked) [data-explain-nav="schedule"],
	#ce-demo-shell:has(#demo-forms:checked) [data-explain-nav="forms"],
	#ce-demo-shell:has(#demo-public:checked) [data-explain-nav="public"] {
		display: block;
	}
}
#ce-demo [data-conflict] { display: none; }
#ce-demo:has(#demo-conflict:checked) [data-conflict] { display: block; }
#ce-demo:has(#demo-placed:checked) [data-conflict] { display: none; }
#ce-demo[data-dragging] [data-dnd-chip] { opacity: 0.35; }
#ce-demo[data-dragging] [data-dnd-slot="ok"],
#ce-demo [data-dnd-slot="ok"][data-over="1"] {
	border-color: rgb(16 185 129 / 0.7);
	background-color: rgb(2 44 34 / 0.4);
}
#ce-demo [data-dnd-slot="conflict"][data-over="1"] {
	box-shadow: inset 0 0 0 1px rgb(248 113 113 / 0.75);
	background-color: rgb(69 10 10 / 0.4);
}
#ce-demo [data-dnd-chip] { touch-action: none; }
#ce-demo[data-dragging],
#ce-demo[data-dragging] * { cursor: grabbing; }
`;

const DEMO_DND_JS = `(function(){
	if (window.__ceDemoDnd) return;
	window.__ceDemoDnd = true;
	var drag = null;
	function rootEl() { return document.getElementById("ce-demo"); }
	function placedEl() { return document.getElementById("demo-placed"); }
	function conflictEl() { return document.getElementById("demo-conflict"); }
	function asEl(node) {
		if (!node) return null;
		return node instanceof Element ? node : node.parentElement;
	}
	function clearOver(root) {
		if (!root) return;
		root.querySelectorAll("[data-over]").forEach(function(el) {
			el.removeAttribute("data-over");
		});
	}
	function setConflict(on, msg) {
		var conflict = conflictEl();
		var root = rootEl();
		var banner = root && root.querySelector("[data-conflict]");
		if (conflict) conflict.checked = on;
		if (on && msg && banner) banner.textContent = msg;
	}
	function slotFromPoint(root, x, y) {
		var el = asEl(document.elementFromPoint(x, y));
		if (!el) return null;
		var slot = el.closest("[data-dnd-slot]");
		return slot && root.contains(slot) ? slot : null;
	}
	function makeGhost(chip, x, y) {
		var ghost = chip.cloneNode(true);
		ghost.removeAttribute("data-dnd-chip");
		ghost.setAttribute("aria-hidden", "true");
		ghost.style.position = "fixed";
		ghost.style.left = (x - 24) + "px";
		ghost.style.top = (y - 16) + "px";
		ghost.style.width = chip.offsetWidth + "px";
		ghost.style.margin = "0";
		ghost.style.zIndex = "2147483646";
		ghost.style.pointerEvents = "none";
		ghost.style.transform = "rotate(1.5deg)";
		ghost.style.borderColor = "rgb(16 185 129 / 0.55)";
		ghost.style.background = "rgb(38 38 38)";
		ghost.style.boxShadow = "0 12px 32px rgb(0 0 0 / 0.45)";
		document.body.appendChild(ghost);
		return ghost;
	}
	document.addEventListener("pointerdown", function(e) {
		if (e.button !== 0) return;
		var root = rootEl();
		if (!root) return;
		var el = asEl(e.target);
		var chip = el && el.closest("[data-dnd-chip]");
		if (!chip || !root.contains(chip)) return;
		var placed = placedEl();
		if (placed && placed.checked) return;
		drag = {
			chip: chip,
			startX: e.clientX,
			startY: e.clientY,
			active: false,
			ghost: null
		};
	}, true);
	window.addEventListener("pointermove", function(e) {
		if (!drag) return;
		var root = rootEl();
		if (!root) return;
		var dx = e.clientX - drag.startX;
		var dy = e.clientY - drag.startY;
		if (!drag.active) {
			if (dx * dx + dy * dy < 36) return;
			drag.active = true;
			root.setAttribute("data-dragging", "1");
			setConflict(false);
			drag.ghost = makeGhost(drag.chip, e.clientX, e.clientY);
		}
		if (e.cancelable) e.preventDefault();
		if (drag.ghost) {
			drag.ghost.style.left = (e.clientX - 24) + "px";
			drag.ghost.style.top = (e.clientY - 16) + "px";
		}
		clearOver(root);
		var slot = slotFromPoint(root, e.clientX, e.clientY);
		if (slot) slot.setAttribute("data-over", "1");
	}, { passive: false });
	window.addEventListener("pointerup", function(e) {
		if (!drag) return;
		var root = rootEl();
		var wasActive = drag.active;
		var x = e.clientX;
		var y = e.clientY;
		if (drag.ghost) drag.ghost.remove();
		if (root) root.removeAttribute("data-dragging");
		clearOver(root);
		drag = null;
		if (!wasActive || !root) return;
		if (e.cancelable) e.preventDefault();
		var slot = slotFromPoint(root, x, y);
		if (!slot) return;
		if (slot.getAttribute("data-dnd-slot") === "ok") {
			var placed = placedEl();
			if (placed) placed.checked = true;
			setConflict(false);
			return;
		}
		setConflict(true, slot.getAttribute("data-dnd-msg"));
	});
	window.addEventListener("pointercancel", function() {
		if (!drag) return;
		var root = rootEl();
		if (drag.ghost) drag.ghost.remove();
		if (root) root.removeAttribute("data-dragging");
		clearOver(root);
		drag = null;
	});
	document.addEventListener("click", function(e) {
		var root = rootEl();
		if (!root) return;
		var menu = root.querySelector("[data-demo-menu]");
		if (!menu || !menu.open) return;
		var el = asEl(e.target);
		if (!el) return;
		if (menu.contains(el)) {
			if (el.closest("summary")) return;
			if (el.closest("label")) menu.open = false;
			return;
		}
		menu.open = false;
	}, true);
})();`;

function ChevronIcon() {
	return (
		<svg
			aria-hidden
			viewBox="0 0 16 16"
			className="size-3.5 fill-none stroke-current"
			strokeWidth="1.5"
		>
			<path d="m4 6 4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
		</svg>
	);
}

function DemoMain({ children }: { children: ReactNode }) {
	return <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">{children}</div>;
}

function queueLabelClass() {
	return `${segmentedItemClasses(false)} cursor-pointer has-[:checked]:bg-neutral-800 has-[:checked]:font-medium has-[:checked]:text-neutral-100`;
}

function NavGroup({
	id,
	label,
	items,
}: {
	id: string;
	label: string;
	items: readonly { scene: string; label: string }[];
}) {
	if (items.length === 1) {
		const item = items[0]!;
		return (
			<label
				htmlFor={`demo-${item.scene}`}
				data-nav-group={id}
				data-nav-item={item.scene}
				className="flex cursor-pointer items-center gap-1 rounded-md px-2.5 py-1.5 text-sm font-medium text-neutral-400 hover:bg-neutral-900 hover:text-neutral-100"
			>
				<span>{label}</span>
				<span data-nav-suffix={item.scene} className="font-medium text-neutral-400">
					· {item.label}
				</span>
			</label>
		);
	}

	return (
		<div className="group relative">
			<span
				data-nav-group={id}
				className="flex items-center gap-1 rounded-md px-2.5 py-1.5 text-sm font-medium text-neutral-400"
			>
				<span>{label}</span>
				{items.map((item) => (
					<span
						key={item.scene}
						data-nav-suffix={item.scene}
						className="font-medium text-neutral-400"
					>
						· {item.label}
					</span>
				))}
				<span className="transition-transform group-hover:rotate-180 group-focus-within:rotate-180">
					<ChevronIcon />
				</span>
			</span>
			<div className="invisible absolute left-0 top-full z-50 pt-2 opacity-0 group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100">
				<div className="w-56 rounded-lg border border-neutral-800 bg-neutral-900 p-1.5 shadow-xl shadow-black/30">
					{items.map((item) => (
						<label
							key={item.scene}
							htmlFor={`demo-${item.scene}`}
							data-nav-item={item.scene}
							className="block cursor-pointer rounded-md px-3 py-2 text-sm text-neutral-400 hover:bg-neutral-800 hover:text-neutral-100"
						>
							{item.label}
						</label>
					))}
				</div>
			</div>
		</div>
	);
}

function DashboardPanel() {
	const steps = [
		{ n: "1", label: "CFP", status: "Done", tone: "positive" as const, scene: null },
		{ n: "2", label: "Review", status: "Done", tone: "positive" as const, scene: "review" },
		{ n: "3", label: "Notify", status: "Current", tone: "warning" as const, scene: "submissions" },
		{ n: "4", label: "Speaker ops", status: "Later", tone: "neutral" as const, scene: "speakers" },
		{ n: "5", label: "Schedule", status: "Later", tone: "neutral" as const, scene: "schedule" },
		{ n: "6", label: "Publish", status: "Later", tone: "neutral" as const, scene: "public" },
	] as const;

	return (
		<DemoMain>
			<PageHeader
				eyebrow="Organizer · Program"
				title="Summit"
				description="Work the program lifecycle in order. The cockpit lists every actionable blocker underneath."
			>
				<label
					htmlFor="demo-submissions"
					className={`${buttonClasses("primary", "sm")} cursor-pointer`}
				>
					Review and notify 5
				</label>
			</PageHeader>
			<section aria-label="Program lifecycle" className="space-y-3">
				<h2 className="text-lg font-semibold text-neutral-100">
					Program lifecycle
				</h2>
				<p className="text-sm text-neutral-400">2 of 6 stages complete.</p>
				<ol className="divide-y divide-neutral-800 border-y border-neutral-800">
					{steps.map((step) => {
						const row = (
							<span className="flex w-full items-center justify-between gap-3 px-1 py-3 text-sm">
								<span className="flex items-center gap-3">
									<span
										className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium ${
											step.tone === "positive"
												? "bg-emerald-500/20 text-emerald-300"
												: step.tone === "warning"
													? "bg-amber-500/20 text-amber-200"
													: "bg-neutral-800 text-neutral-400"
										}`}
									>
										{step.n}
									</span>
									<span className="font-medium text-neutral-100">{step.label}</span>
								</span>
								<StatusPill tone={step.tone}>{step.status}</StatusPill>
							</span>
						);
						return (
							<li
								key={step.label}
								className={step.status === "Current" ? "bg-neutral-900/80" : undefined}
							>
								{step.scene ? (
									<label
										htmlFor={`demo-${step.scene}`}
										className="block cursor-pointer hover:bg-neutral-900/60"
									>
										{row}
									</label>
								) : (
									row
								)}
							</li>
						);
					})}
				</ol>
			</section>
			<section className="mt-10 space-y-4">
				<header className="border-b border-neutral-800 pb-4">
					<h2 className="text-lg font-semibold text-neutral-100">
						Pipeline blockers
					</h2>
					<p className="mt-1 text-sm text-neutral-400">
						Live counts for review, notify, schedule, and speaker ops.
					</p>
				</header>
				<ul className="divide-y divide-neutral-800 border-t border-neutral-800">
					<li>
						<label
							htmlFor="demo-submissions"
							className="flex cursor-pointer items-center justify-between gap-3 py-3 text-sm hover:bg-neutral-800/40"
						>
							<span className="text-neutral-200">5 speakers unnotified</span>
							<StatusPill tone="warning">To notify</StatusPill>
						</label>
					</li>
					<li>
						<label
							htmlFor="demo-speakers"
							className="flex cursor-pointer items-center justify-between gap-3 py-3 text-sm hover:bg-neutral-800/40"
						>
							<span className="text-neutral-200">3 speakers missing materials</span>
							<StatusPill tone="warning">Tasks</StatusPill>
						</label>
					</li>
					<li>
						<label
							htmlFor="demo-schedule"
							className="flex cursor-pointer items-center justify-between gap-3 py-3 text-sm hover:bg-neutral-800/40"
						>
							<span className="text-neutral-200">1 accepted talk unplaced</span>
							<StatusPill tone="warning">Schedule</StatusPill>
						</label>
					</li>
				</ul>
			</section>
		</DemoMain>
	);
}

function SubmissionsPanel() {
	return (
		<DemoMain>
			<PageHeader
				eyebrow="Organizer · Submissions"
				title="Summit"
				description="Accept or decline here. Speakers are not emailed until you notify. Queue shows 5 of 5 in to notify."
			>
				<div className={SEGMENTED_CONTAINER_CLASSES} role="group" aria-label="Queue">
					<label className={queueLabelClass()}>
						<input
							type="radio"
							name="demo-queue"
							id="demo-q-notify"
							defaultChecked
							className="sr-only"
						/>
						To notify
					</label>
					<label className={queueLabelClass()}>
						<input
							type="radio"
							name="demo-queue"
							id="demo-q-accepted"
							className="sr-only"
						/>
						Accepted
					</label>
					<label className={queueLabelClass()}>
						<input
							type="radio"
							name="demo-queue"
							id="demo-q-declined"
							className="sr-only"
						/>
						Declined
					</label>
				</div>
			</PageHeader>

			<div data-unnotified className="mb-4 rounded-md border border-amber-900/60 bg-amber-950/30 p-3">
				<div className="flex flex-wrap items-center justify-between gap-2">
					<p className="text-sm text-amber-100/90">
						5 decided on this page. Speakers have not been informed yet.
					</p>
					<label
						htmlFor="demo-compose"
						className={`${buttonClasses("primary", "sm")} cursor-pointer`}
					>
						Review and notify 5
					</label>
				</div>
			</div>
			<p data-notified className={`mb-4 ${noticeClasses("positive")}`}>
				5 speakers emailed. The public page is still quiet.
			</p>

			<ul className="divide-y divide-neutral-800 border-t border-neutral-800">
				{TALKS.map((talk) => (
					<li
						key={talk.id}
						data-status={talk.status}
						className="px-1 py-3 text-sm transition-colors hover:bg-neutral-800/40 sm:px-0"
					>
						<div className="flex items-start justify-between gap-3">
							<p className="font-medium text-neutral-100">{talk.title}</p>
							<div className="flex shrink-0 flex-wrap justify-end gap-1.5">
								<Chip>{talk.category}</Chip>
								<StatusPill
									tone={talk.status === "accepted" ? "positive" : "negative"}
								>
									{talk.status}
								</StatusPill>
								<span data-unnotified>
									<StatusPill tone="warning">Unnotified</StatusPill>
								</span>
								<span data-notified>
									<StatusPill tone="positive">Notified</StatusPill>
								</span>
							</div>
						</div>
						<p className="mt-1 text-neutral-400">
							{talk.speaker} · {talk.email} · {talk.format}
						</p>
						<p className="mt-1.5 text-xs text-neutral-500">
							{talk.reviewers} reviewers assigned
							{talk.tasks ? ` · tasks ${talk.tasks} required` : ""} · {talk.score}
						</p>
					</li>
				))}
			</ul>
		</DemoMain>
	);
}

function ReviewPanel() {
	return (
		<DemoMain>
			<PageHeader
				eyebrow="Organizer · Review"
				title="Summit"
				description="Build the rubric, issue named review links, balance workload, and decide proposals from one scoped workspace."
			/>
			<div className="overflow-hidden rounded-lg border border-neutral-800">
				<div className="border-b border-neutral-800 px-4 py-3">
					<p className="text-sm font-medium text-neutral-100">
						Agents in production
					</p>
					<p className="mt-1 text-[13px] text-neutral-500">
						Assigned to you · Relevance, Depth, Delivery
					</p>
					<div className="mt-3 flex gap-1.5">
						{[1, 2, 3, 4, 5].map((value) => (
							<label
								key={value}
								className="flex min-w-9 cursor-pointer items-center justify-center rounded-md px-2 py-1.5 text-sm tabular-nums text-neutral-500 hover:bg-neutral-900 hover:text-neutral-300 has-[:checked]:bg-neutral-800 has-[:checked]:font-semibold has-[:checked]:text-neutral-100"
							>
								<input
									type="radio"
									name="demo-score"
									defaultChecked={value === 4}
									className="sr-only"
								/>
								{value}
							</label>
						))}
					</div>
				</div>
				<ul className="divide-y divide-neutral-800">
					{TALKS.slice(0, 4).map((talk) => (
						<li
							key={talk.id}
							className="flex items-center justify-between gap-3 px-4 py-3 text-sm"
						>
							<div className="min-w-0">
								<p className="truncate font-medium text-neutral-100">
									{talk.title}
								</p>
								<p className="mt-0.5 text-[13px] text-neutral-500">
									{talk.speaker}
								</p>
							</div>
							<div className="flex shrink-0 items-center gap-2">
								<span className="tabular-nums text-neutral-300">{talk.score}</span>
								<StatusPill
									tone={talk.status === "accepted" ? "positive" : "negative"}
								>
									{talk.status}
								</StatusPill>
							</div>
						</li>
					))}
				</ul>
			</div>
		</DemoMain>
	);
}

function SpeakersPanel() {
	const rows = [
		{ name: "Maya Chen", missing: "slides", tone: "warning" as const },
		{ name: "Jonas Weber", missing: "headshot", tone: "warning" as const },
		{ name: "Ines Almeida", missing: "bio · slides", tone: "warning" as const },
		{ name: "Priya Nair", missing: "clear", tone: "positive" as const },
	];
	return (
		<DemoMain>
			<PageHeader
				eyebrow="Organizer · Speaker tasks"
				title="Summit"
				description="Action tasks, file-request deliverables, and the uploaded file library in one workspace."
			>
				<label
					htmlFor="demo-reminded"
					data-remind
					className={`${buttonClasses("secondary", "sm")} cursor-pointer`}
				>
					Remind incomplete
				</label>
				<span
					data-reminded
					className={`${buttonClasses("secondary", "sm")} opacity-70`}
				>
					Reminders sent
				</span>
			</PageHeader>
			<ul className="divide-y divide-neutral-800 border-t border-neutral-800">
				{rows.map((row) => (
					<li
						key={row.name}
						className="flex items-center justify-between gap-3 py-3 text-sm"
					>
						<span className="font-medium text-neutral-200">{row.name}</span>
						<StatusPill tone={row.tone}>
							{row.tone === "positive" ? "clear" : row.missing}
						</StatusPill>
					</li>
				))}
			</ul>
			<p data-reminded className={`mt-4 ${noticeClasses("positive")}`}>
				Reminder queued for 3 speakers.
			</p>
		</DemoMain>
	);
}

function SlotCard({
	title,
	speaker,
	time,
}: {
	title: string;
	speaker: string;
	time: string;
}) {
	return (
		<div className="m-0.5 box-border overflow-hidden rounded-md border border-neutral-700 bg-neutral-800 px-2 py-1 text-xs text-neutral-100">
			<p className="line-clamp-3 font-medium leading-snug">{title}</p>
			<p className="mt-0.5 truncate text-[11px] text-neutral-300">{speaker}</p>
			<p className="mt-0.5 font-mono tabular-nums text-[11px] text-neutral-400">
				{time}
			</p>
		</div>
	);
}

function ConflictSlot({
	msg,
	children,
}: {
	msg: string;
	children?: ReactNode;
}) {
	return (
		<div data-dnd-slot="conflict" data-dnd-msg={msg} className="min-h-10">
			{children ?? <div className="h-10" />}
		</div>
	);
}

function SchedulePanel() {
	return (
		<DemoMain>
			<PageHeader
				eyebrow="Organizer · Schedule"
				title="Summit"
				description="Place or drag accepted talks onto the grid. Room, speaker, and configured track conflicts are blocked and shown loudly."
			/>
			<div className="mb-3 flex flex-wrap items-center gap-3 text-sm text-neutral-300">
				<span>
					View{" "}
					<span className={`inline-block ${INPUT_CLASSES} py-1`}>Day grid</span>
				</span>
				<span className="text-neutral-400">Thu 12 Jun · America/Los_Angeles</span>
			</div>
			<div className="mb-2 flex flex-wrap items-center gap-2">
				<h2 className="text-sm font-medium uppercase tracking-wide text-neutral-500">
					Unplaced
				</h2>
				<label
					htmlFor="demo-placed"
					data-unplaced
					className={`${buttonClasses("secondary", "sm")} ml-auto cursor-pointer`}
				>
					Auto-place
				</label>
				<span
					data-placed
					className={`${buttonClasses("secondary", "sm")} ml-auto opacity-70`}
				>
					Auto-place
				</span>
				<span className={buttonClasses("secondary", "sm")}>Publish day (3)</span>
			</div>
			<p data-placed className="mb-3 text-sm text-neutral-500">
				No unplaced sessions. Talks placed on other days stay on those days.
			</p>
			<ul data-unplaced className="mb-3 flex flex-wrap gap-2">
				<li>
					<button
						type="button"
						data-dnd-chip
						className="block max-w-xs cursor-grab select-none rounded-md border border-neutral-700 bg-neutral-950/60 px-3 py-2 text-left text-sm text-neutral-200 hover:border-neutral-500 active:cursor-grabbing"
					>
						<p className="font-medium">Postgres for AI workloads</p>
						<p className="mt-0.5 text-xs opacity-80">
							40m · accepted · Maya Chen
						</p>
					</button>
				</li>
			</ul>
			<p data-conflict role="alert" className={`${noticeClasses("negative")} mb-3`}>
				Room conflict: that slot is already taken.
			</p>
			<div className="overflow-x-auto rounded-lg border border-neutral-800 bg-neutral-900">
				<table className="w-full min-w-[40rem] table-fixed border-collapse text-sm">
					<thead>
						<tr className="border-b border-neutral-800 bg-neutral-950/60">
							<th className="w-16 px-2 py-2 text-left font-medium text-neutral-300">
								Time
							</th>
							<th className="px-2 py-2 text-left font-medium text-neutral-300">
								Main Stage
							</th>
							<th className="px-2 py-2 text-left font-medium text-neutral-300">
								Room B
							</th>
							<th className="px-2 py-2 text-left font-medium text-neutral-300">
								Workshop Lab
							</th>
						</tr>
					</thead>
					<tbody>
						<tr className="border-b border-dotted border-neutral-800" style={{ height: "2.5rem" }}>
							<td className="px-2 py-1 font-mono text-xs tabular-nums text-neutral-500">
								11:00
							</td>
							<td className="p-0 align-top">
								<ConflictSlot
									msg={
										'Room conflict in "Main Stage": "Evals beyond vibes" already occupies that slot, so "Postgres for AI workloads" can\'t go there.'
									}
								>
									<SlotCard
										title="Evals beyond vibes"
										speaker="Priya Nair"
										time="11:00–11:30"
									/>
								</ConflictSlot>
							</td>
							<td className="p-0 align-top">
								<ConflictSlot
									msg={
										'Room conflict in "Room B": "Agents in production" (11:30–12:10) already occupies that slot, so "Postgres for AI workloads" can\'t go there.'
									}
								/>
							</td>
							<td className="p-0 align-top">
								<ConflictSlot
									msg={
										'Room conflict in "Workshop Lab": "Prompt injection red-teaming" already occupies that slot, so "Postgres for AI workloads" can\'t go there.'
									}
								>
									<SlotCard
										title="Prompt injection red-teaming"
										speaker="Felix Braun"
										time="11:00–12:00"
									/>
								</ConflictSlot>
							</td>
						</tr>
						<tr className="border-b border-dotted border-neutral-800" style={{ height: "2.5rem" }}>
							<td className="px-2 py-1 font-mono text-xs tabular-nums text-neutral-500">
								11:30
							</td>
							<td className="p-0 align-top">
								<label
									htmlFor="demo-placed"
									data-unplaced
									data-dnd-slot="ok"
									className="flex h-10 w-full cursor-pointer border border-transparent hover:border-neutral-600 hover:bg-neutral-800/40"
									aria-label="Place in Main Stage at 11:30"
								/>
								<div data-placed>
									<SlotCard
										title="Postgres for AI workloads"
										speaker="Maya Chen"
										time="11:30–12:10"
									/>
								</div>
							</td>
							<td className="p-0 align-top">
								<ConflictSlot
									msg={
										'Room conflict in "Room B": "Agents in production" already occupies that slot, so "Postgres for AI workloads" can\'t go there.'
									}
								>
									<SlotCard
										title="Agents in production"
										speaker="Jonas Weber"
										time="11:30–12:10"
									/>
								</ConflictSlot>
							</td>
							<td className="p-0 align-top">
								<ConflictSlot
									msg={
										'Room conflict in "Workshop Lab": "Prompt injection red-teaming" (11:00–12:00) already occupies that slot, so "Postgres for AI workloads" can\'t go there.'
									}
								/>
							</td>
						</tr>
					</tbody>
				</table>
			</div>
		</DemoMain>
	);
}

function FormsPanel() {
	return (
		<DemoMain>
			<PageHeader
				eyebrow="CFP"
				title="Forms"
				description="Edit field definitions for each call for papers. Changes apply to new submissions immediately."
			/>
			<ul className="divide-y divide-neutral-800 rounded-lg border border-neutral-800 bg-neutral-900">
				<li className="flex items-center justify-between gap-4 px-4 py-4">
					<span>
						<span className="block font-medium text-neutral-100">CFP</span>
						<span className="mt-0.5 block text-xs text-neutral-500">
							/cfp · live
						</span>
					</span>
					<span className="text-sm text-emerald-400">Edit fields</span>
				</li>
			</ul>
			<div className="mt-8 space-y-3 rounded-lg border border-neutral-800 p-4">
				<p className="text-xs font-medium uppercase tracking-wide text-neutral-500">
					Fields · CFP
				</p>
				<label className="block text-sm text-neutral-300">
					Title
					<input
						readOnly
						className={`mt-1 w-full ${INPUT_CLASSES}`}
						value="Postgres for AI workloads"
					/>
				</label>
				<fieldset className="text-sm text-neutral-300">
					<legend>Format</legend>
					<div className="mt-1 flex gap-2">
						<label
							className={`${buttonClasses("secondary", "sm")} cursor-pointer has-[:checked]:border-neutral-500 has-[:checked]:bg-neutral-800`}
						>
							<input
								type="radio"
								name="demo-format"
								id="demo-format-talk"
								defaultChecked
								className="sr-only"
							/>
							Talk
						</label>
						<label
							className={`${buttonClasses("secondary", "sm")} cursor-pointer has-[:checked]:border-neutral-500 has-[:checked]:bg-neutral-800`}
						>
							<input
								type="radio"
								name="demo-format"
								id="demo-format-workshop"
								className="sr-only"
							/>
							Workshop
						</label>
					</div>
				</fieldset>
				<label data-talk-fields className="block text-sm text-neutral-300">
					Level
					<input
						readOnly
						className={`mt-1 w-full ${INPUT_CLASSES}`}
						value="Intermediate"
					/>
				</label>
				<div data-workshop-fields className="space-y-3">
					<label className="block text-sm text-neutral-300">
						Duration
						<input
							readOnly
							className={`mt-1 w-full ${INPUT_CLASSES}`}
							value="90 minutes"
						/>
					</label>
					<label className="block text-sm text-neutral-300">
						Prerequisites
						<input
							readOnly
							className={`mt-1 w-full ${INPUT_CLASSES}`}
							value="Laptop, Docker"
						/>
					</label>
				</div>
			</div>
		</DemoMain>
	);
}

function PublicPanel() {
	return (
		<DemoMain>
			<PageHeader
				eyebrow="Public schedule"
				title="Summit"
				description="Published sessions only. Unconfirmed speakers read as Speaker to be announced."
			/>
			<ul className="divide-y divide-neutral-800 border-t border-neutral-800">
				<li className="py-3">
					<p className="font-mono text-xs tabular-nums text-neutral-500">
						11:00 · Main Stage
					</p>
					<p className="mt-1 text-sm font-medium text-neutral-100">
						Evals beyond vibes
					</p>
					<p className="mt-0.5 text-[13px] text-neutral-400">Priya Nair</p>
				</li>
				<li className="py-3">
					<p className="font-mono text-xs tabular-nums text-neutral-500">
						11:30 · Main Stage
					</p>
					<p className="mt-1 text-sm font-medium text-neutral-100">
						Shipping agents at scale
					</p>
					<p className="mt-0.5 text-[13px] text-neutral-500">
						Speaker to be announced
					</p>
				</li>
				<li className="py-3">
					<p className="font-mono text-xs tabular-nums text-neutral-500">
						11:30 · Room B
					</p>
					<p className="mt-1 text-sm font-medium text-neutral-100">
						Agents in production
					</p>
					<p className="mt-0.5 text-[13px] text-neutral-400">Jonas Weber</p>
				</li>
			</ul>
		</DemoMain>
	);
}

function NotifyModal() {
	return (
		<div
			data-compose
			className="absolute inset-0 z-30 items-center justify-center p-4"
		>
			<label
				htmlFor="demo-compose"
				className="absolute inset-0 bg-black/60"
				aria-hidden
			/>
			<div className="relative w-full max-w-lg space-y-3 rounded-lg border border-neutral-700 bg-neutral-900 p-4 shadow-xl">
				<h2 className="text-base font-medium text-neutral-100">
					Review and notify 5
				</h2>
				<p className="text-sm text-neutral-400">
					Speakers have not been informed yet. Edit the message, check who gets
					it, then send.
				</p>
				<ul className="max-h-36 space-y-1 overflow-y-auto rounded-md border border-neutral-800 bg-neutral-950/50 p-3 text-sm text-neutral-300">
					{TALKS.map((talk) => (
						<li key={talk.id}>
							<span className="text-neutral-100">{talk.title}</span>
							<span className="text-neutral-500"> · {talk.speaker}</span>
						</li>
					))}
				</ul>
				<label className="block text-xs text-neutral-400">
					Subject
					<input
						readOnly
						className={`mt-1 w-full ${INPUT_CLASSES}`}
						value="Your talk for Summit"
					/>
				</label>
				<label className="block text-xs text-neutral-400">
					Body
					<textarea
						readOnly
						rows={4}
						className={`mt-1 w-full ${INPUT_CLASSES} font-mono text-xs`}
						value="We are glad to accept your talk. The speaker portal has your next steps."
					/>
				</label>
				<div className="flex justify-end gap-2">
					<label
						htmlFor="demo-compose"
						className={`${buttonClasses("secondary", "sm")} cursor-pointer`}
					>
						Cancel
					</label>
					<label
						htmlFor="demo-notified"
						className={`${buttonClasses("primary", "sm")} cursor-pointer`}
					>
						Send to 5
					</label>
				</div>
			</div>
		</div>
	);
}

const EXPLAINERS = [
	{
		scene: "dashboard",
		title: "The board",
		body: "Six stages and live blockers. You see what's stuck before you open a list.",
	},
	{
		scene: "submissions",
		title: "Decide first. Mail later.",
		body: "Accept, waitlist, reject. Speakers hear nothing until you hit send.",
		hint: "Try Review and notify 5.",
	},
	{
		scene: "review",
		title: "Assigned review",
		body: "Reviewers only see their queue. Scores against the rubric. The chair reads a board, not a thread.",
	},
	{
		scene: "speakers",
		title: "Chase materials",
		body: "Magic link for bio, headshot, slides. Remind the ones who haven't.",
	},
	{
		scene: "schedule",
		title: "Drag. Conflicts shout.",
		body: "Drop an accepted talk on the grid. Room and speaker clashes block the drop.",
		hint: "Drag Postgres onto 11:30 Main Stage.",
	},
	{
		scene: "forms",
		title: "The form changes",
		body: "A workshop asks duration and prerequisites. A keynote doesn't.",
	},
	{
		scene: "public",
		title: "Published only",
		body: "Schedule, speakers, subscribe feed. Drafts stay in the admin.",
	},
] as const;

function DemoExplainer() {
	return (
		<nav
			aria-label="What this screen is for"
			className="mb-6 xl:sticky xl:top-24 xl:mb-0 xl:self-start"
		>
			{EXPLAINERS.map((item) => (
				<label
					key={item.scene}
					htmlFor={`demo-${item.scene}`}
					data-explain-nav={item.scene}
					className="block cursor-pointer py-1 xl:border-t xl:border-neutral-800 xl:py-3 xl:first:border-t-0"
				>
					<span
						data-explain-title
						className="block text-[15px] font-medium tracking-tight"
					>
						{item.title}
					</span>
					<span
						data-explain-body
						className="mt-2 block text-sm font-normal leading-relaxed text-neutral-400"
					>
						{item.body}
						{"hint" in item ? (
							<span className="mt-2 block text-neutral-500">{item.hint}</span>
						) : null}
					</span>
				</label>
			))}
		</nav>
	);
}

export function LandingProductDemo() {
	return (
		<div
			id="ce-demo-shell"
			className="xl:grid xl:grid-cols-[17.5rem_minmax(0,1fr)] xl:items-start xl:gap-12"
		>
			<DemoExplainer />
			<div
				id="programme"
				className="scroll-mt-16 rounded-2xl bg-neutral-900 p-1.5 shadow-[0_24px_80px_rgba(0,0,0,0.65)]"
			>
				<div
					id="ce-demo"
					className="relative rounded-xl border border-neutral-800 bg-neutral-950"
				>
					<style>{DEMO_CSS}</style>
				<input type="radio" name="demo-scene" id="demo-dashboard" className="sr-only" />
				<input
					type="radio"
					name="demo-scene"
					id="demo-submissions"
					defaultChecked
					className="sr-only"
				/>
				<input type="radio" name="demo-scene" id="demo-review" className="sr-only" />
				<input type="radio" name="demo-scene" id="demo-speakers" className="sr-only" />
				<input type="radio" name="demo-scene" id="demo-schedule" className="sr-only" />
				<input type="radio" name="demo-scene" id="demo-forms" className="sr-only" />
				<input type="radio" name="demo-scene" id="demo-public" className="sr-only" />
				<input type="checkbox" id="demo-notified" className="sr-only" />
				<input type="checkbox" id="demo-compose" className="sr-only" />
				<input type="checkbox" id="demo-placed" className="sr-only" />
				<input type="checkbox" id="demo-conflict" className="sr-only" />
				<input type="checkbox" id="demo-reminded" className="sr-only" />

				<header className="relative z-20 rounded-t-xl border-b border-neutral-800 bg-neutral-950/90">
					<div className="flex min-h-14 items-center gap-3 px-4 sm:px-6">
						<span className="flex shrink-0 items-center gap-2">
							<LogoMark />
							<span className="text-sm font-semibold tracking-tight text-neutral-100 max-[360px]:hidden">
								conference-engine
							</span>
						</span>
						<nav
							aria-label="Demo workspace"
							className="ml-2 hidden items-center gap-1 lg:flex"
						>
							{NAV_GROUPS.map((group) => (
								<NavGroup
									key={group.id}
									id={group.id}
									label={group.label}
									items={group.items}
								/>
							))}
						</nav>
						<div className="ml-auto hidden items-center gap-1 lg:flex">
							<label
								htmlFor="demo-public"
								data-nav-public
								className="cursor-pointer rounded-md border border-neutral-800 bg-neutral-900 px-2.5 py-1.5 text-sm font-medium text-neutral-200 hover:bg-neutral-800"
							>
								View public
							</label>
						</div>
						<details data-demo-menu className="relative ml-auto lg:hidden">
							<summary className="flex cursor-pointer list-none items-center gap-1.5 rounded-md border border-neutral-800 bg-neutral-900 px-3 py-1.5 text-sm font-medium text-neutral-200 [&::-webkit-details-marker]:hidden">
								<span>Event menu</span>
								<ChevronIcon />
							</summary>
							<div className="absolute right-0 top-[calc(100%+0.5rem)] z-50 w-[min(22rem,calc(100vw-3rem))] rounded-lg border border-neutral-800 bg-neutral-900 p-3 shadow-xl shadow-black/30">
								<div className="grid grid-cols-2 gap-x-4 gap-y-5">
									{NAV_GROUPS.map((group) => (
										<section key={group.id}>
											<p className="px-2 text-xs font-medium uppercase tracking-wide text-neutral-500">
												{group.label}
											</p>
											<div className="mt-1">
												{group.items.map((item) => (
													<label
														key={item.scene}
														htmlFor={`demo-${item.scene}`}
														data-nav-item={item.scene}
														className="block cursor-pointer rounded-md px-2 py-1.5 text-sm text-neutral-400 hover:bg-neutral-800 hover:text-neutral-100"
													>
														{item.label}
													</label>
												))}
											</div>
										</section>
									))}
								</div>
								<label
									htmlFor="demo-public"
									data-nav-public
									className="mt-3 block cursor-pointer rounded-md bg-neutral-800 px-2 py-2 text-center text-sm font-medium text-neutral-100"
								>
									View public
								</label>
							</div>
						</details>
					</div>
				</header>

				<div className="h-[min(44rem,78vh)] overflow-y-auto rounded-b-xl">
					<div data-panel="dashboard">
						<DashboardPanel />
					</div>
					<div data-panel="submissions">
						<SubmissionsPanel />
					</div>
					<div data-panel="review">
						<ReviewPanel />
					</div>
					<div data-panel="speakers">
						<SpeakersPanel />
					</div>
					<div data-panel="schedule">
						<SchedulePanel />
					</div>
					<div data-panel="forms">
						<FormsPanel />
					</div>
					<div data-panel="public">
						<PublicPanel />
					</div>
				</div>

				<NotifyModal />
				<script dangerouslySetInnerHTML={{ __html: DEMO_DND_JS }} />
			</div>
			</div>
		</div>
	);
}
