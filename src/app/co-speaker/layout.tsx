import { AppNav } from "@/components/app-nav";

export default function CoSpeakerLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	return (
		<div className="min-h-dvh bg-neutral-950 text-neutral-200">
			<AppNav ariaLabel="Co-speaker" />
			{children}
		</div>
	);
}
