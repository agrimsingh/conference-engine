import { AppNav } from "@/components/app-nav";

export default function HandoffLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	return (
		<div className="min-h-dvh bg-neutral-950 text-neutral-200">
			<AppNav ariaLabel="Speaker handoff" />
			{children}
		</div>
	);
}
