import { PublicSiteNav } from "@/components/public-site-nav";

export default function DemoLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	return (
		<div className="min-h-dvh bg-neutral-950 text-neutral-200">
			<PublicSiteNav ariaLabel="Demo" />
			{children}
		</div>
	);
}
