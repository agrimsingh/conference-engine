import type { SubmissionPacingChart as PacingChart } from "@/lib/domain";

type Props = {
	chart: PacingChart;
};

const WIDTH = 640;
const HEIGHT = 180;
const PAD = { top: 16, right: 16, bottom: 28, left: 36 };

function polylinePoints(
	series: { x: number; cumulative: number }[],
	xMin: number,
	xMax: number,
	yMax: number,
	/** When true, larger x sits on the left (days-until-start). */
	invertX: boolean,
): string {
	const innerW = WIDTH - PAD.left - PAD.right;
	const innerH = HEIGHT - PAD.top - PAD.bottom;
	return series
		.map((point, index) => {
			const rawT =
				series.length === 1
					? 0
					: xMax === xMin
						? index / (series.length - 1)
						: (point.x - xMin) / (xMax - xMin);
			const t = invertX ? 1 - rawT : rawT;
			const px = PAD.left + t * innerW;
			const py =
				PAD.top +
				innerH -
				(yMax === 0 ? 0 : (point.cumulative / yMax) * innerH);
			return `${px},${py}`;
		})
		.join(" ");
}

export function SubmissionPacingChart({ chart }: Props) {
	const xLabel =
		chart.xAxis === "days_until_start"
			? "Days until event"
			: "Days since open";
	const invertX = chart.xAxis === "days_until_start";

	if (chart.points.length === 0) {
		return (
			<section
				aria-label="Submission pacing"
				className="mb-8 border border-neutral-800 bg-neutral-900/40 px-4 py-5"
			>
				<div className="flex flex-wrap items-baseline justify-between gap-2">
					<h2 className="text-sm font-medium text-neutral-100">
						Submission pacing
					</h2>
					<p className="text-xs text-neutral-500">No submissions yet</p>
				</div>
				<p className="mt-2 text-sm text-neutral-400">
					Cumulative CFP volume will plot here once the form opens or the
					first submission lands.
				</p>
			</section>
		);
	}

	const seriesForX = chart.prior
		? [...chart.points, ...chart.prior]
		: chart.points;
	const xValues = seriesForX.map((p) => p.x);
	const xMin = Math.min(...xValues);
	const xMax = Math.max(...xValues);
	const yMax = Math.max(
		1,
		...chart.points.map((p) => p.cumulative),
		...(chart.prior ?? []).map((p) => p.cumulative),
	);

	const currentPath = polylinePoints(
		chart.points,
		xMin,
		xMax,
		yMax,
		invertX,
	);
	const priorPath = chart.prior
		? polylinePoints(chart.prior, xMin, xMax, yMax, invertX)
		: null;

	const leftX = invertX ? xMax : xMin;
	const rightX = invertX ? xMin : xMax;

	return (
		<section
			aria-label="Submission pacing"
			className="mb-8 border border-neutral-800 bg-neutral-900/40 px-4 py-5"
		>
			<div className="flex flex-wrap items-baseline justify-between gap-2">
				<h2 className="text-sm font-medium text-neutral-100">
					Submission pacing
				</h2>
				<p className="text-xs text-neutral-500">
					{chart.total} total · {xLabel}
				</p>
			</div>
			<p className="mt-1 text-sm text-neutral-400">
				Cumulative submissions vs {xLabel.toLowerCase()}.
				{chart.prior ? " Dashed line is the prior edition." : ""}
			</p>

			<svg
				viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
				role="img"
				aria-label={`Cumulative submissions, ${chart.total} total`}
				className="mt-4 h-auto w-full text-emerald-400"
			>
				<line
					x1={PAD.left}
					y1={PAD.top}
					x2={PAD.left}
					y2={HEIGHT - PAD.bottom}
					stroke="currentColor"
					strokeOpacity={0.2}
				/>
				<line
					x1={PAD.left}
					y1={HEIGHT - PAD.bottom}
					x2={WIDTH - PAD.right}
					y2={HEIGHT - PAD.bottom}
					stroke="currentColor"
					strokeOpacity={0.2}
				/>
				{priorPath ? (
					<polyline
						fill="none"
						stroke="currentColor"
						strokeOpacity={0.45}
						strokeWidth={1.5}
						strokeDasharray="4 3"
						points={priorPath}
					/>
				) : null}
				<polyline
					fill="none"
					stroke="currentColor"
					strokeWidth={2}
					points={currentPath}
				/>
				<text
					x={PAD.left}
					y={HEIGHT - 8}
					fill="currentColor"
					fillOpacity={0.55}
					fontSize={11}
				>
					{leftX}
				</text>
				<text
					x={WIDTH - PAD.right}
					y={HEIGHT - 8}
					fill="currentColor"
					fillOpacity={0.55}
					fontSize={11}
					textAnchor="end"
				>
					{rightX}
				</text>
				<text
					x={PAD.left - 8}
					y={PAD.top + 4}
					fill="currentColor"
					fillOpacity={0.55}
					fontSize={11}
					textAnchor="end"
				>
					{yMax}
				</text>
				<text
					x={PAD.left - 8}
					y={HEIGHT - PAD.bottom}
					fill="currentColor"
					fillOpacity={0.55}
					fontSize={11}
					textAnchor="end"
				>
					0
				</text>
			</svg>
		</section>
	);
}
