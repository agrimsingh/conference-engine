export default function PortalLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	return <div className="min-h-dvh bg-neutral-50">{children}</div>;
}
