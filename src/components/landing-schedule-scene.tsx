const HOUR_PX = 64;
const SCENE_START_MIN = 9 * 60;
const SCENE_END_MIN = 15.25 * 60;
const SCENE_HEIGHT = ((SCENE_END_MIN - SCENE_START_MIN) / 60) * HOUR_PX;

type SlotCard = {
	title: string;
	speaker: string;
	start: string;
	end: string;
	startMin: number;
	durationMin: number;
};

type Lane = {
	room: string;
	capacity: number;
	slots: SlotCard[];
};

function slot(
	title: string,
	speaker: string,
	start: string,
	end: string,
): SlotCard {
	const [sh, sm] = start.split(":").map(Number);
	const [eh, em] = end.split(":").map(Number);
	const startMin = sh * 60 + sm;
	return {
		title,
		speaker,
		start,
		end,
		startMin,
		durationMin: eh * 60 + em - startMin,
	};
}

const LANES: Lane[] = [
	{
		room: "Main Stage",
		capacity: 320,
		slots: [
			slot("Opening keynote: the agentic web", "Amara Diallo", "9:00", "9:45"),
			slot(
				"Agents in production: what actually breaks",
				"Jonas Weber",
				"10:00",
				"10:45",
			),
			slot("Evals beyond vibes", "Priya Nair", "11:00", "11:30"),
			slot("Serving a million tokens a second", "Sam Okafor", "13:00", "13:45"),
			slot("Small models, big jobs", "Lena Fischer", "14:00", "14:30"),
		],
	},
	{
		room: "Room B",
		capacity: 120,
		slots: [
			slot("Structured outputs at scale", "Diego Reyes", "9:30", "10:00"),
			slot("Guardrails that don't lobotomize", "Hana Sato", "10:15", "10:45"),
			slot("Prompt injection red-teaming", "Felix Braun", "13:30", "14:15"),
		],
	},
	{
		room: "Workshop Lab",
		capacity: 60,
		slots: [
			slot("Workshop: build an MCP server", "Ines Almeida", "9:00", "10:30"),
			slot("Workshop: fine-tuning on one GPU", "Maya Chen", "11:00", "12:30"),
			slot(
				"Workshop: observability for agents",
				"Tom Eriksen",
				"13:30",
				"15:00",
			),
		],
	},
];

const DRAG_CARD = slot(
	"Postgres for AI workloads",
	"Maya Chen",
	"11:00",
	"11:45",
);

const UNSCHEDULED: {
	title: string;
	speaker: string;
	duration: string;
	tags: string[];
}[] = [
	{
		title: "Eval pipelines in CI",
		speaker: "Ravi Patel",
		duration: "30m",
		tags: ["Evals", "Intermediate"],
	},
	{
		title: "The MCP ecosystem, one year in",
		speaker: "Zoe Martin",
		duration: "45m",
		tags: ["Tooling", "Beginner"],
	},
	{
		title: "RAG postmortems",
		speaker: "Omar Haddad",
		duration: "30m",
		tags: ["Retrieval", "Advanced"],
	},
	{
		title: "Voice agents in production",
		speaker: "Julia Kovacs",
		duration: "30m",
		tags: ["Agents", "Intermediate"],
	},
	{
		title: "Shipping multimodal search",
		speaker: "Wei Lin",
		duration: "45m",
		tags: ["Multimodal", "Advanced"],
	},
];

function yFor(startMin: number): number {
	return ((startMin - SCENE_START_MIN) / 60) * HOUR_PX;
}

function hFor(durationMin: number): number {
	return (durationMin / 60) * HOUR_PX;
}

function GripIcon() {
	return (
		<svg
			className="h-3.5 w-3.5 text-neutral-600"
			viewBox="0 0 16 16"
			fill="currentColor"
			aria-hidden
		>
			<circle cx="6" cy="4" r="1.2" />
			<circle cx="10" cy="4" r="1.2" />
			<circle cx="6" cy="8" r="1.2" />
			<circle cx="10" cy="8" r="1.2" />
			<circle cx="6" cy="12" r="1.2" />
			<circle cx="10" cy="12" r="1.2" />
		</svg>
	);
}

function WarningIcon() {
	return (
		<svg
			className="h-3.5 w-3.5 shrink-0"
			viewBox="0 0 16 16"
			fill="none"
			stroke="currentColor"
			strokeWidth="1.5"
			strokeLinecap="round"
			strokeLinejoin="round"
			aria-hidden
		>
			<path d="M8 2 1.5 13.5h13L8 2Z" />
			<path d="M8 6.5v3M8 11.8v.2" />
		</svg>
	);
}

function SlotCardBox({ card }: { card: SlotCard }) {
	return (
		<div
			className="absolute inset-x-1.5 overflow-hidden rounded-md border border-neutral-800 bg-neutral-900 px-2.5 py-1.5"
			style={{ top: yFor(card.startMin), height: hFor(card.durationMin) - 4 }}
		>
			<p className="truncate text-[13px] font-medium leading-tight text-neutral-200">
				{card.title}
			</p>
			{card.durationMin > 30 ? (
				<p className="truncate text-[11px] leading-tight text-neutral-400">
					{card.start}–{card.end} · {card.speaker}
				</p>
			) : null}
		</div>
	);
}

export function LandingScheduleScene() {
	const hours = [9, 10, 11, 12, 13, 14, 15];
	return (
		<div aria-hidden className="relative select-none" role="presentation">
			<div className="mx-auto flex max-w-7xl flex-wrap items-center gap-2 px-4 pb-3 sm:px-6">
				<span className="rounded-full border border-neutral-700 px-2.5 py-0.5 text-[11px] text-neutral-400">
					Interface preview
				</span>
				<div className="flex items-center gap-1 text-xs">
					{["Day 1", "Day 2", "Day 3"].map((day, i) => (
						<span
							key={day}
							className={
								i === 0
									? "rounded-md bg-neutral-800 px-2.5 py-1 font-medium text-neutral-100"
									: "rounded-md px-2.5 py-1 text-neutral-400"
							}
						>
							{day}
						</span>
					))}
				</div>
				<div className="ml-auto flex items-center gap-1 text-xs">
					{["List", "Day", "Week", "Track", "Room"].map((view) => (
						<span
							key={view}
							className={
								view === "Day"
									? "rounded-md bg-neutral-800 px-2.5 py-1 font-medium text-neutral-100"
									: "hidden rounded-md px-2.5 py-1 text-neutral-400 sm:inline"
							}
						>
							{view}
						</span>
					))}
				</div>
			</div>

			<div className="mx-auto flex max-w-7xl gap-4 px-4 sm:px-6">
				<aside className="hidden w-60 shrink-0 lg:block">
					<div className="flex items-baseline justify-between border-b border-neutral-800 pb-2">
						<p className="text-xs font-medium text-neutral-300">
							Unscheduled · Accepted
						</p>
						<span className="text-xs text-neutral-500">8</span>
					</div>
					<ul className="mt-2 space-y-1.5">
						{UNSCHEDULED.map((item) => (
							<li
								key={item.title}
								className="flex items-start gap-2 rounded-md border border-neutral-800 bg-neutral-900 px-2.5 py-2"
							>
								<span className="mt-0.5">
									<GripIcon />
								</span>
								<span className="min-w-0">
									<span className="block truncate text-[13px] font-medium leading-tight text-neutral-200">
										{item.title}
									</span>
									<span className="block text-[11px] text-neutral-400">
										{item.speaker} · {item.duration}
									</span>
									<span className="mt-1 flex gap-1">
										{item.tags.map((tag) => (
											<span
												key={tag}
												className="rounded border border-neutral-700/80 px-1 py-px text-[10px] leading-tight text-neutral-400"
											>
												{tag}
											</span>
										))}
									</span>
								</span>
							</li>
						))}
						<li className="px-2.5 py-1 text-[11px] text-neutral-500">
							+ 3 more
						</li>
					</ul>
				</aside>

				<div className="min-w-0 flex-1 overflow-x-auto">
					<div className="min-w-[640px]">
						<div className="grid grid-cols-[44px_repeat(3,1fr)] border-b border-neutral-800 pb-2">
							<span />
							{LANES.map((lane) => (
								<div key={lane.room} className="px-2">
									<p className="text-sm font-medium text-neutral-200">
										{lane.room}
									</p>
									<p className="text-[11px] text-neutral-400">
										{lane.capacity} seats
									</p>
								</div>
							))}
						</div>
						<div
							className="relative grid grid-cols-[44px_repeat(3,1fr)]"
							style={{ height: SCENE_HEIGHT }}
						>
							{hours.map((hour) => (
								<div
									key={hour}
									className="pointer-events-none absolute inset-x-0 border-t border-dotted border-neutral-800"
									style={{ top: yFor(hour * 60) }}
								/>
							))}
							<div className="relative">
								{hours.map((hour) => (
									<span
										key={hour}
										className="absolute -translate-y-1/2 text-[11px] tabular-nums text-neutral-500"
										style={{ top: yFor(hour * 60) }}
									>
										{String(hour).padStart(2, "0")}:00
									</span>
								))}
							</div>
							{LANES.map((lane, laneIndex) => (
								<div
									key={lane.room}
									className="relative border-l border-neutral-800/70"
								>
									{lane.slots.map((card) => (
										<SlotCardBox key={card.title} card={card} />
									))}
									{laneIndex === 1 ? (
										<>
											<div
												className="absolute inset-x-1.5 rounded-md border border-dashed border-neutral-600 bg-neutral-900/40"
												style={{
													top: yFor(DRAG_CARD.startMin),
													height: hFor(DRAG_CARD.durationMin) - 4,
												}}
											/>
											<div
												className="drag-card absolute z-10 rounded-md border border-emerald-400/60 bg-neutral-800 px-2.5 py-1.5 shadow-xl shadow-black/60"
												style={{
													top: yFor(DRAG_CARD.startMin) + 16,
													height: hFor(DRAG_CARD.durationMin) - 4,
													left: 20,
													right: -14,
												}}
											>
												<p className="truncate text-[13px] font-medium leading-tight text-neutral-100">
													{DRAG_CARD.title}
												</p>
												<p className="truncate text-[11px] leading-tight text-neutral-400">
													{DRAG_CARD.start}–{DRAG_CARD.end} ·{" "}
													{DRAG_CARD.speaker}
												</p>
											</div>
											<div
												className="absolute left-0 z-20 flex w-52 -translate-x-28 items-center gap-1.5 rounded-md border border-red-400/60 bg-red-600 px-2.5 py-1.5 text-[11px] font-semibold text-white shadow-lg shadow-black/40 sm:w-max sm:-translate-x-8 sm:whitespace-nowrap"
												style={{
													top:
														yFor(DRAG_CARD.startMin) +
														hFor(DRAG_CARD.durationMin) +
														18,
												}}
											>
												<WarningIcon />
												Speaker conflict — Maya Chen is in two rooms
											</div>
										</>
									) : null}
								</div>
							))}
						</div>
					</div>
				</div>
			</div>

			<div className="pointer-events-none absolute inset-x-0 bottom-0 h-44 bg-gradient-to-t from-neutral-950 to-transparent" />
		</div>
	);
}
