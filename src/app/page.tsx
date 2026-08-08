import Link from "next/link";

export default function Home() {
	return (
		<main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center gap-6 px-4 py-16 text-neutral-900">
			<p className="text-xs uppercase tracking-wide text-neutral-500">conference-engine</p>
			<h1 className="text-4xl font-semibold tracking-tight">Sat slice</h1>
			<p className="text-sm text-neutral-600">
				Local path: open CFP → D1 submission → organizer list (admin bypass cookie).
			</p>
			<ul className="space-y-2 text-sm">
				<li>
					<Link className="underline" href="/e/aie-sandbox/submit/cfp">
						Public CFP
					</Link>
				</li>
				<li>
					<Link className="underline" href="/admin/bypass">
						Admin bypass → submissions
					</Link>
				</li>
			</ul>
		</main>
	);
}
